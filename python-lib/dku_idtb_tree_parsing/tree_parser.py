import numpy as np
from dku_idtb_decision_tree.node import Node
from dataiku.doctor.preprocessing.dataframe_preprocessing import RescalingProcessor2, QuantileBinSeries, UnfoldVectorProcessor, BinarizeSeries, \
    FastSparseDummifyProcessor, TargetEncodingStep, FrequencyEncodingStep, OrdinalEncodingStep, FlagMissingValue2, TextCountVectorizerProcessor, \
    TextHashingVectorizerWithSVDProcessor, TextHashingVectorizerProcessor, TextTFIDFVectorizerProcessor, CategoricalFeatureHashingProcessor, DatetimeCyclicalEncodingStep
from dku_idtb_tree_parsing.depreprocessor import descale_numerical_thresholds, denormalize_feature_value
from dku_idtb_compatibility.utils import format_float
from dku_idtb_decision_tree.tree import InteractiveTree
from collections import deque
import logging
from json import loads
import pandas as pd

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='Error Analysis Plugin | %(levelname)s - %(message)s')

class TreeParser(object):
    class SplitParameters(object):
        def __init__(self, node_type, chart_name, value=None, friendly_name=None,
                     value_func=lambda threshold: threshold,
                     add_preprocessed_feature=lambda array, col: array[:, col],
                     invert_left_and_right=lambda threshold: False):
            self.node_type = node_type
            self.chart_name = chart_name
            self.friendly_name = friendly_name
            self.value = value
            self.value_func = value_func
            self.add_preprocessed_feature = add_preprocessed_feature
            self.invert_left_and_right = invert_left_and_right

        @property
        def feature(self):
            return self.friendly_name or self.chart_name

    def __init__(self, model_handler):
        self.model_handler = model_handler
        self.feature_list = model_handler.get_predictor().get_features()
        self.preprocessed_feature_mapping = {}
        self.rescalers = {}
        self.num_features = set()
        self.preprocessed_to_original_name = {}
        self._create_preprocessed_feature_mapping()

    def _add_flag_missing_value_mapping(self, step):
        self.preprocessed_feature_mapping[step._output_name()] = \
            self.SplitParameters(Node.TYPES.CAT, step.feature, [np.nan])

    # CATEGORICAL HANDLING
    def _add_cat_hashing_not_whole_mapping(self, step):
        logger.warning(
            "The model uses categorical hashing without whole category hashing enabled.\
            This is not recommanded."
        )
        for i in range(step.n_features):
            preprocessed_name = "hashing:{}:{}".format(step.column_name, i)
            friendly_name = "Hash {} of {}".format(i, step.column_name)
            self.preprocessed_to_original_name[friendly_name] = step.column_name
            self.num_features.add(friendly_name)
            self.preprocessed_feature_mapping[preprocessed_name] = \
                self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    def _add_cat_hashing_whole_mapping(self, step):
        value_func = lambda i: lambda threshold: [threshold * 2 * i]
        friendly_name = "Hash of {}".format(step.column_name)
        self.preprocessed_to_original_name[friendly_name] = step.column_name
        add_preprocessed_feature = lambda i: lambda array, col: np.sum(
            np.multiply(range(step.n_features), array[:, col - i : col - i + step.n_features]),
            axis=1)

        for i in range(step.n_features):
            preprocessed_name = "hashing:{}:{}".format(step.column_name, i)
            self.preprocessed_feature_mapping[preprocessed_name] = \
                self.SplitParameters(Node.TYPES.CAT, step.column_name,
                                     friendly_name=friendly_name,
                                     value_func=value_func(i),
                                     add_preprocessed_feature=add_preprocessed_feature(i),
                                     invert_left_and_right=lambda threshold: threshold > 0)

    def _add_dummy_mapping(self, step):
        for value in step.values:
            preprocessed_name = "dummy:{}:{}".format(step.input_column_name, value)
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.CAT, step.input_column_name, [value], invert_left_and_right=lambda threshold: True)
        self.preprocessed_feature_mapping["dummy:{}:N/A".format(step.input_column_name)] = self.SplitParameters(Node.TYPES.CAT, step.input_column_name, [np.nan], invert_left_and_right=lambda threshold: True)
        if not step.should_drop:
            self.preprocessed_feature_mapping["dummy:{}:__Others__".format(step.input_column_name)] = self.SplitParameters(Node.TYPES.CAT, step.input_column_name, step.values)

    def _add_target_encoding_mapping(self, step):
        impact_map = step.impact_coder.encoding_map
        is_reg = len(impact_map.columns.values) == 1
        for value in impact_map.columns.values:
            preprocessed_name = "{}:{}:{}".format(step.encoding_name, step.column_name, value)
            friendly_name = "{} [{} on target]".format(step.column_name, step.encoding_name) if is_reg else "{} [{} {}]".format(step.column_name, step.encoding_name, value)
            self.num_features.add(friendly_name)
            self.preprocessed_to_original_name[friendly_name] = step.column_name
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    def _add_frequency_encoding_mapping(self, step):
        preprocessed_name = "frequency:{}:{}".format(step.column_name, step.suffix)
        friendly_name = "{} [{} encoded]".format(step.column_name, step.suffix)
        self.num_features.add(friendly_name)
        self.preprocessed_to_original_name[friendly_name] = step.column_name
        self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    def _add_ordinal_encoding_mapping(self, step):
        preprocessed_name = "ordinal:{}:{}".format(step.column_name, step.suffix)
        friendly_name = "{} [ordinal encoded ({})]".format(step.column_name, step.suffix)
        self.num_features.add(friendly_name)
        self.preprocessed_to_original_name[friendly_name] = step.column_name
        self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    # NUMERICAL HANDLING
    def _add_identity_mapping(self, original_name):
        self.preprocessed_feature_mapping[original_name] = self.SplitParameters(Node.TYPES.NUM, original_name)

    def _add_binarize_mapping(self, step):
        self.preprocessed_feature_mapping["num_binarized:" + step._output_name()] = self.SplitParameters(Node.TYPES.NUM, step.in_col, step.threshold)

    def _add_quantize_mapping(self, step):
        bounds = step.r["bounds"]
        value_func = lambda threshold: denormalize_feature_value(self.rescalers[step.in_col], float(bounds[int(threshold) + 1]))
        preprocessed_name = "num_quantized:{0}:quantile:{1}".format(step.in_col, step.nb_bins)
        self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.in_col, value_func=value_func)

    def _add_datetime_cyclical_encoding_mapping(self, step):
        for period in step.selected_periods:
            preprocessed_name = "datetime_cyclical:{}:{}:cos".format(step.column_name, period.lower())
            friendly_name = "{} [{} cycle (cos)]".format(step.column_name, period.lower())
            self.num_features.add(friendly_name)
            self.preprocessed_to_original_name[friendly_name] = step.column_name
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

            preprocessed_name = "datetime_cyclical:{}:{}:sin".format(step.column_name, period.lower())
            friendly_name = "{} [{} cycle (sin)]".format(step.column_name, period.lower())
            self.num_features.add(friendly_name)
            self.preprocessed_to_original_name[friendly_name] = step.column_name
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    # VECTOR HANDLING
    def _add_unfold_mapping(self, step):
        for i in range(step.vector_length):
            preprocessed_name = "unfold:{}:{}".format(step.input_column_name, i)
            friendly_name = "{} [element {}]".format(step.input_column_name, i)
            self.num_features.add(friendly_name)
            self.preprocessed_to_original_name[friendly_name] = step.input_column_name
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, friendly_name)

    # TEXT HANDLING
    def _add_hashing_vect_mapping(self, step, with_svd=False):
        prefix = "thsvd" if with_svd else "hashvect"
        for i in range(step.n_features):
            preprocessed_name = "{}:{}:{}".format(prefix, step.column_name, i)
            friendly_name = "{} [text {}]".format(step.column_name, i)
            self.num_features.add(friendly_name)
            self.preprocessed_to_original_name[friendly_name] = step.column_name
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    def _add_text_count_vect_mapping(self, step):
        for word in step.resource["vectorizer"].get_feature_names():
            preprocessed_name = "{}:{}:{}".format(step.prefix, step.column_name, word)
            friendly_name = "{}: occurrences of {}".format(step.column_name, word)
            self.num_features.add(friendly_name)
            self.preprocessed_to_original_name[friendly_name] = step.column_name
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    def _add_tfidf_vect_mapping(self, step):
        vec = step.resource["vectorizer"]
        for word, idf in zip(vec.get_feature_names(), vec.idf_):
            preprocessed_name = "tfidfvec:{}:{:.3f}:{}".format(step.column_name, idf, word)
            friendly_name = "{}: tf-idf of {} (idf={})".format(step.column_name, word, format_float(idf, 3))
            self.num_features.add(friendly_name)
            self.preprocessed_to_original_name[friendly_name] = step.column_name
            self.preprocessed_feature_mapping[preprocessed_name] = self.SplitParameters(Node.TYPES.NUM, step.column_name, friendly_name=friendly_name)

    def _create_preprocessed_feature_mapping(self):
        for step in self.model_handler.get_pipeline().steps:
            if isinstance(step, RescalingProcessor2):
                self.rescalers[step.in_col] = step
            {
                CategoricalFeatureHashingProcessor: \
                    lambda step: self._add_cat_hashing_whole_mapping(step) if getattr(step, "hash_whole_categories", False)\
                        else self._add_cat_hashing_not_whole_mapping(step),
                FlagMissingValue2: self._add_flag_missing_value_mapping,
                QuantileBinSeries: self._add_quantize_mapping,
                BinarizeSeries: self._add_binarize_mapping,
                DatetimeCyclicalEncodingStep: self._add_datetime_cyclical_encoding_mapping,
                UnfoldVectorProcessor: self._add_unfold_mapping,
                FastSparseDummifyProcessor: self._add_dummy_mapping,
                TargetEncodingStep: self._add_target_encoding_mapping,
                OrdinalEncodingStep: self._add_ordinal_encoding_mapping,
                FrequencyEncodingStep: self._add_frequency_encoding_mapping,
                TextCountVectorizerProcessor: self._add_text_count_vect_mapping,
                TextHashingVectorizerWithSVDProcessor: lambda step: self._add_hashing_vect_mapping(step, with_svd=True),
                TextHashingVectorizerProcessor: self._add_hashing_vect_mapping,
                TextTFIDFVectorizerProcessor: self._add_tfidf_vect_mapping
            }.get(step.__class__, lambda step: None)(step)

    def _get_split_parameters(self, preprocessed_name):
        # Numerical features can have no preprocessing performed on them ("kept as regular")
        if preprocessed_name not in self.preprocessed_feature_mapping:
            self._add_identity_mapping(preprocessed_name)
        return self.preprocessed_feature_mapping[preprocessed_name]

    # PARSING

    def parse_nodes(self, tree, df):
        preprocessed_x = self.model_handler.get_pipeline().process(df)["TRAIN"].as_dataframe().values #TODO
        decision_tree = self.model_handler.get_clf().tree_
        thresholds = descale_numerical_thresholds(decision_tree, self.feature_list, self.rescalers)
        children_left, children_right, features = decision_tree.children_left, decision_tree.children_right, decision_tree.feature

        tree.preprocessed_to_original_name = self.preprocessed_to_original_name

        root_node = tree.get_node(0)
        root_node.treated_as_numerical |= self.num_features
        collector_data = self.model_handler.get_collector_data()["per_feature"]
        for feature_name, feature_params in self.model_handler.get_per_feature().items():
            if feature_params["role"] != "INPUT":
                continue

            if feature_params["type"] == "TEXT":
                tree.features[feature_name]["missing_handling"] = "NONE"
                continue

            tree.features[feature_name]["missing_handling"] = feature_params["missing_handling"]
            if feature_params["missing_handling"] == "IMPUTE":
                tree.features[feature_name]["missing_impute_value"] = collector_data[feature_name]["missing_impute_with_value"]
            if feature_params["type"] == "CATEGORY": # TODO
                root_node.treated_as_numerical.discard(feature_name)
            else:
                root_node.treated_as_numerical.add(feature_name)
            if feature_params["type"] == "VECTOR":
                tree.df.drop(feature_name, axis=1, inplace=True)

        ids = deque()
        ids.append(0)
        while ids:
            node_id = ids.popleft()
            # Create its children if any
            if children_left[node_id] < 0:
                continue

            feature_idx, threshold = features[node_id], thresholds[node_id]
            preprocessed_feature = self.feature_list[feature_idx]
            split_parameters = self._get_split_parameters(preprocessed_feature)
            if split_parameters.feature not in tree.df:
                tree.df[split_parameters.feature] = split_parameters.add_preprocessed_feature(preprocessed_x, feature_idx)
            value = split_parameters.value
            if value is None:
                value = split_parameters.value_func(threshold)
            if split_parameters.invert_left_and_right(threshold):
                left_child_id, right_child_id = children_right[node_id], children_left[node_id]
            else:
                left_child_id, right_child_id = children_left[node_id], children_right[node_id]

            node = tree.get_node(node_id)
            if split_parameters.node_type == Node.TYPES.NUM:
                tree.add_numerical_split_no_siblings(node, split_parameters.feature, value, left_child_id, right_child_id)
            else:
                tree.add_categorical_split(node, split_parameters.feature, value, left_child_id, right_child_id)
            ids.append(left_child_id)
            ids.append(right_child_id)
