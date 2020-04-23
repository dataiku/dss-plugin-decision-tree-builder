import re
from collections import defaultdict, namedtuple
import numpy as np
import dataiku
from model_metadata import get_model_handler, get_analysis
from utils import breadth_first_index_generator


class TreeParser(object):

    def __init__(self, model_id, version_id=None):

        self.model = dataiku.Model(model_id)
        self.model_handler = get_model_handler(self.model, version_id=version_id)
        self.predictor = self.model_handler.get_predictor()

        model_info_dict = self.extract_info_from_model()
        self.model_info = namedtuple("IDTB_Model", model_info_dict.keys())(*model_info_dict.values())

        tree_info_dict = self.extract_info_from_tree()
        self.tree_info = namedtuple("IDTB_Tree", tree_info_dict.keys())(*tree_info_dict.values())

    def extract_info_from_model(self):

        treated_as_numerical = {}
        for feature, feature_setting in self.model_handler.get_per_feature().iteritems():
            if feature_setting.get('type') == 'NUMERIC' and feature != self.model_handler.get_target_variable():
                treated_as_numerical[feature] = None

        processed_features = self.predictor.features
        original_features = self.model_handler.input_columns()
        feature_mapping = {}
        feature_category_dict = defaultdict(list)
        for processed_feature in processed_features:
            if processed_feature.startswith('dummy'):
                for original_feature in original_features:
                    pattern = r'dummy:{}:(.*)'.format(original_feature)
                    match = re.search(pattern, processed_feature)
                    if match:
                        category_value = match.group(1)
                        if category_value in ['N/A', '__Others__']:
                            category_value = '__Others__'
                        else:
                            feature_category_dict[original_feature].append(category_value)

                        feature_mapping[processed_feature] = [original_feature, [category_value]]
                        break
            elif processed_feature in original_features:
                feature_mapping[processed_feature] = [processed_feature, None]
            else:
                raise ValueError(
                    'Can not find a match for {} in the list of original features'.format(processed_feature))

        clean_feature_mapping = {}
        for feature, feature_info in feature_mapping.iteritems():
            if feature_info[1] == ['__Others__']:
                all_values = feature_category_dict[feature_info[0]]
                clean_feature_mapping[feature] = [feature_info[0], all_values]
            else:
                clean_feature_mapping[feature] = feature_info

        target_mapping = {v: k for k, v in self.model_handler.get_target_map().items()}

        preproc_handler = self.model_handler.get_preproc_handler()
        preprocessing_info = preproc_handler.collector_data.get('per_feature')

        model_info = {
            'treated_as_numerical': treated_as_numerical,
            'processed_features': processed_features,
            'clean_feature_mapping': clean_feature_mapping,
            'target_mapping': target_mapping,
            'preprocessing_info': preprocessing_info
        }

        return model_info

    def extract_info_from_tree(self):

        tree = self.predictor._clf.tree_
        parents = np.array([-1] * tree.node_count)
        for parent_index, child_index in enumerate(tree.children_left):
            if child_index != -1:
                parents[child_index] = parent_index
        for parent_index, child_index in enumerate(tree.children_right):
            if child_index != -1:
                parents[child_index] = parent_index

        features = [None] * tree.node_count
        for node_index, feature_index in enumerate(tree.feature):
            children_indexes = [tree.children_left[node_index], tree.children_right[node_index]]
            for child_index in children_indexes:
                if child_index != -1:
                    features[child_index] = self.model_info.processed_features[feature_index]

        samples = np.round(tree.value).reshape(-1, 2).astype(int)
        probabilities = np.true_divide(samples, samples.sum(axis=1, keepdims=True))
        predictions = [self.model_info.target_mapping[target_index] for target_index in
                       np.argmax(probabilities, axis=1)]

        is_left_child_list = [False] * tree.node_count
        for feature_index in tree.children_left:
            if feature_index != -1:
                is_left_child_list[feature_index] = True

        population_size = samples[0].sum()
        node_size = np.sum(samples, axis=1, dtype=float)
        node_size_ratio = 100 * node_size / population_size
        node_size_info = [[int(x), y] for x, y in zip(node_size, node_size_ratio)]

        node_threshold = [-1] * tree.node_count
        for node_index, threshold in enumerate(tree.threshold):
            left_child_index = tree.children_left[node_index]
            right_child_index = tree.children_right[node_index]

            if left_child_index != right_child_index:
                node_threshold[left_child_index] = threshold
                node_threshold[right_child_index] = threshold

        # create a reference breadth first index system because scikit uses a depth first index system
        index_mapping = {depth_first_index: breadth_first_index for depth_first_index, breadth_first_index in
                         enumerate(list(breadth_first_index_generator(tree.max_depth)))}
        index_mapping[-1] = -1

        tree_info = {
            "tree": tree,
            "parents": parents,
            "features": features,
            "probabilities": probabilities,
            "predictions": predictions,
            "is_left_child_list": is_left_child_list,
            "node_size_info": node_size_info,
            "node_threshold": node_threshold,
            "index_mapping": index_mapping
        }
        return tree_info

    def build_all_nodes(self):

        nodes = {}
        for node_index in xrange(self.tree_info.tree.node_count):
            node_info = {}
            node_info["treated_as_numerical"] = self.model_info.treated_as_numerical
            children_list = np.array(
                [self.tree_info.tree.children_left[node_index], self.tree_info.tree.children_right[node_index]])
            node_info['children_ids'] = map(lambda x: self.tree_info.index_mapping.get(x),
                                            children_list[children_list >= 0].tolist())
            node_info['probabilities'] = [[label, probability] for label, probability in
                                          zip(self.predictor.get_classes(), self.tree_info.probabilities[node_index])]
            node_info['prediction'] = self.tree_info.predictions[node_index]
            node_info['parent_id'] = self.tree_info.index_mapping.get(self.tree_info.parents[node_index])
            node_info['samples'] = self.tree_info.node_size_info[node_index]
            node_info['id'] = self.tree_info.index_mapping.get(node_index)
            node_info['label'] = None

            feature_name, feature_value = self.model_info.clean_feature_mapping.get(self.tree_info.features[node_index],
                                                                                    [None, None])
            node_info['feature'] = feature_name
            if self.tree_info.features[node_index] in self.model_info.treated_as_numerical.keys():
                if self.tree_info.is_left_child_list[node_index]:
                    node_info['end'] = self.tree_info.node_threshold[node_index]
                else:
                    node_info['beginning'] = self.tree_info.node_threshold[node_index]
            else:
                if self.model_info.clean_feature_mapping.get(self.tree_info.features[node_index]):
                    node_info['values'] = feature_value
                    node_info['others'] = self.tree_info.is_left_child_list[node_index]

            nodes[self.tree_info.index_mapping.get(node_index)] = node_info

        return nodes

    def build_tree(self):

        nodes = self.build_all_nodes()

        target = self.model_handler.get_target_variable()
        target_value = self.predictor.get_classes()

        last_index = max(nodes.keys()) + 1

        split_desc = self.model_handler.get_split_desc().get('params')
        sample_size = split_desc.get('ssdSelection', {}).get('maxRecords', 10000)
        sample_method = 'head'  # TODO fetch this from the mltask settings

        analysis = get_analysis(self.model)
        analysis_def = analysis.get_definition()
        training_dataset_name = analysis_def.get_raw().get('inputDatasetSmartName')

        features = {}
        for column in self.model_handler.input_columns():
            if column in self.model_info.treated_as_numerical:
                features[column] = {
                    'nr_uses': 0,
                    'mean': self.model_info.preprocessing_info.get(column).get('stats').get('average')
                }
            else:
                features[column] = {'nr_uses': 0}

        for node_index, node_info in nodes.iteritems():
            feature_used = node_info.get('feature')
            if feature_used is not None:
                features[feature_used]['nr_uses'] += 0.5  # a split results in 2 nodes having the feature used

        tree_dict = {
            'sample_size': sample_size,
            'features': features,
            'name': training_dataset_name,
            'sample_method': sample_method,
            'target_values': target_value,
            'last_index': last_index,
            'target': target,
            'nodes': nodes
        }

        return tree_dict
