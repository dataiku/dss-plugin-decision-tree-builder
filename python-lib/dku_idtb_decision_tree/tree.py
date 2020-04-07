from dku_idtb_decision_tree.node import Node, CategoricalNode, NumericalNode
from dku_idtb_compatibility.utils import safe_str
from collections import deque
import pandas as pd


class Tree(object):
    def __init__(self, target, target_values, features):
        self.target = target
        self.target_values = target_values
        self.features = features
        self.nodes = {}
        self.leaves = set()

    def get_node(self, i):
        return self.nodes.get(i)

    def add_node(self, node):
        self.nodes[node.id] = node
        self.leaves.add(node.id)
        self.leaves.discard(node.parent_id)

    def get_filtered_df(self, node, df):
        node_id = node.id
        while node_id > 0:
            node = self.get_node(node_id)
            if node.get_type() == Node.TYPES.NUM:
                df = node.apply_filter(df, self.features[node.feature]["mean"])
            else:
                df = node.apply_filter(df)
            node_id = node.parent_id
        return df

    def parse_nodes(self, nodes, rebuild_nodes=False, numerical_features=None):
        self.nodes, ids = {}, deque()
        root_node_dict = nodes["0"]
        treated_as_numerical = set(root_node_dict["treated_as_numerical"])
        if numerical_features is not None:
            treated_as_numerical.intersection_update(numerical_features)
        root_node = Node(0, -1, treated_as_numerical)
        root_node.label = root_node_dict["label"]
        self.add_node(root_node)

        ids += root_node_dict["children_ids"]

        while ids:
            dict_node = nodes[safe_str(ids.popleft())]
            treated_as_numerical = set(dict_node["treated_as_numerical"])
            feature = dict_node["feature"]
            if numerical_features is not None:
                treated_as_numerical.intersection_update(numerical_features)
            if dict_node.get("values") is not None:
                node = CategoricalNode(dict_node["id"],
                                       dict_node["parent_id"],
                                       treated_as_numerical,
                                       feature,
                                       dict_node["values"],
                                       others=dict_node["others"])
            else:
                node = NumericalNode(dict_node["id"],
                                    dict_node["parent_id"],
                                    treated_as_numerical,
                                    feature,
                                    beginning=dict_node.get("beginning", None),
                                    end=dict_node.get("end", None))
            node.label = dict_node["label"]
            self.add_node(node)
            if rebuild_nodes:
                node.rebuild(dict_node["prediction"],
                            dict_node["samples"],
                            dict_node["probabilities"])
            ids += dict_node["children_ids"]

# Used by the recipes
class ScoringTree(Tree):
    def __init__(self, target, target_values, nodes, features):
        super(ScoringTree, self).__init__(target, target_values, features)
        self.parse_nodes(nodes, rebuild_nodes=True)

    def add_node(self, node):
        parent_node = self.get_node(node.parent_id)
        if parent_node is not None:
            parent_node.children_ids.append(node.id)
        super(ScoringTree, self).add_node(node)

#Used by the webapp
class InteractiveTree(Tree):
    """
    A decision tree

    ATTRIBUTES
    df: pd.DataFrame, the dataset

    name: str, name of the dataset

    target: str, the name of the target feature

    nodes: dict, a map from ids to the corresponding nodes in the tree

    last_index: positive integer, the value for the id of the next node

    features: dict, a map from feature names to the number of usage in the various splits of the tree (useful for recipes) \
            and the mean of the feature if can be treated as numerical

    leaves: set, set of leaves id

    target_values: list, a list of the values the target can take

    sample_method: string, the method used for sampling

    sample_size: positive integer, the number of rows for the sampling
    """
    def __init__(self, df, name, target, sample_method='head', sample_size=None, nodes=None, last_index=1,
                 features=None):
        try:
            df = df.dropna(subset=[target])
            df.loc[:, target] = df.loc[:, target].apply(safe_str) # for classification
        except KeyError:
            raise Exception("The target %s is not one of the columns of the dataset" % target)
        target_values = list(df[target].unique())
        features, numerical_feature_set = InteractiveTree.get_features_with_meanings(df, target, features)
        super(InteractiveTree, self).__init__(target, target_values, features)
        self.df = df
        self.name = name
        self.last_index = last_index
        self.sample_method = sample_method
        self.sample_size = sample_size
        if nodes is None:
            root = Node(0, -1, set())
            root.treated_as_numerical = numerical_feature_set
            self.add_node(root)
        else:
            self.parse_nodes(nodes, numerical_features=numerical_feature_set)

    def change_meaning(self, i, feature):
        node = self.get_node(i)
        if feature in node.treated_as_numerical:
            node.treated_as_numerical.remove(feature)
        else:
            node.treated_as_numerical.add(feature)
        return self.get_stats(i, feature)

    def get_stats(self, i, col):
        node = self.get_node(i)
        filtered_df = self.get_filtered_df(node, self.df)
        column = filtered_df[col]
        target_column = filtered_df[self.target]
        if col in node.treated_as_numerical:
            return self.get_stats_numerical_node(column, target_column, self.features[col]["mean"])
        return self.get_stats_categorical_node(column, target_column, self.df[col].dropna().apply(safe_str))

    def get_stats_numerical_node(self, column, target_column, mean):
        if column.empty:
            return {"no_values": True}

        stats = {"bins": [], "mean": column.mean(), "max": column.max(), "min": column.min()}
        bins = pd.cut(column.fillna(mean), bins = min(10, column.nunique()), include_lowest = True, right = False)
        target_grouped = target_column.groupby(bins)
        target_distrib = target_grouped.apply(lambda x: x.value_counts())
        col_distrib = target_grouped.count()
        for interval, count in col_distrib.items():
            stats["bins"].append({"value": safe_str(interval),
                                    "target_distrib": target_distrib[interval].to_dict() if count > 0 else {},
                                    "mid": interval.mid,
                                    "count": count})
        return stats

    def get_stats_categorical_node(self, column, target_column, unfiltered_col):
        stats = {"bins": []}
        empty_values = set(unfiltered_col.unique())
        if not column.empty:
            target_grouped = target_column.groupby(column.fillna("No values").apply(safe_str))
            target_distrib = target_grouped.value_counts(dropna=False)
            col_distrib = target_grouped.count().sort_values(ascending=False)
            empty_values -= set(col_distrib.index)
            stats["same_target_distrib"] = True
            for value in col_distrib.index:
                stats["bins"].append({"value": value,
                                      "target_distrib": target_distrib[value].to_dict(),
                                      "count": col_distrib[value]})
                if stats.get("same_target_distrib") and stats["bins"][0]["target_distrib"] != stats["bins"][-1]["target_distrib"]:
                    del stats["same_target_distrib"]
        else:
            stats["no_values"] = True
        for value in empty_values:
            stats["bins"].append({"value": safe_str(value), "count": 0})
        return stats

    def set_node_info(self, node):
        filtered_df = self.get_filtered_df(node, self.df)
        probabilities = filtered_df[self.target].value_counts(normalize=True).round(3)
        samples = filtered_df.shape[0]
        sorted_proba = sorted(probabilities.to_dict().items(), key=lambda x: (-x[1], x[0]))
        if samples > 0:
            prediction = sorted_proba[0][0]
        else:
            prediction = None
        if node.id == 0:
            node.set_node_info(samples, samples, sorted_proba, prediction)
        else:
            node.set_node_info(samples, self.get_node(0).samples[0], sorted_proba, prediction)

    def add_split(self, parent_id, feature, value):
        parent_node = self.get_node(parent_id)
        if feature in parent_node.treated_as_numerical:
            if not parent_node.children_ids:
                self.add_numerical_split_no_siblings(parent_node, feature, value)
            else:
                self.add_numerical_split_if_siblings(parent_node, feature, value)
        else:
            self.add_categorical_split(parent_node, feature, value)
        return self.jsonify_nodes()

    def add_numerical_split_if_siblings(self, parent_node, feature, value):
        left, right = None, self.get_node(parent_node.children_ids[0])
        right_idx = 0
        while right is not None and (right.end is None or right.end < value):
            right_idx += 1
            left = right
            if right_idx < len(parent_node.children_ids):
                right = self.get_node(parent_node.children_ids[right_idx])
            else:
                right = None
        if right is None:
            new_node = NumericalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, beginning=value)
            self.last_index += 1
            self.add_node(new_node)
            self.update_numerical_node(left, value, True)
            return {"left": left.jsonify(), "right": new_node.jsonify(), "parent": parent_node.jsonify()}

        new_node = NumericalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, end=value)
        self.last_index += 1
        if left is not None:
            self.kill_children(right)
            new_node.beginning = left.end
        self.update_numerical_node(right, value, False)
        self.add_node(new_node, right_idx)
        return {"left": new_node.jsonify(), "right": right.jsonify(), "parent": parent_node.jsonify()}

    def add_numerical_split_no_siblings(self, parent_node, feature, value):
        self.features[feature]["nr_uses"] += 1
        new_node_left = NumericalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, end=value)
        self.last_index += 1
        new_node_right = NumericalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, beginning=value)
        self.last_index += 1
        self.add_node(new_node_left)
        self.add_node(new_node_right)
        return {"left": new_node_left.jsonify(), "right": new_node_right.jsonify(), "parent": parent_node.jsonify()}

    def add_categorical_split(self, parent_node, feature, values):
        left = CategoricalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, values)
        self.last_index += 1
        if not parent_node.children_ids:
            self.features[feature]["nr_uses"] += 1
            right = CategoricalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, list(values), others=True)
            self.last_index += 1
        else:
            right = self.get_node(parent_node.children_ids.pop())
            self.update_categorical_node(right, values, None)

        self.add_node(left)
        self.add_node(right)
        return {"left": left.jsonify(), "right": right.jsonify(), "parent": parent_node.jsonify()}

    def update_split(self, feature, left_id, right_id, value):
        left, right = self.get_node(left_id), self.get_node(right_id)
        if left.get_type() == Node.TYPES.NUM:
            if left.beginning is not None and value < left.beginning:
                parent_node = self.get_node(left.parent_id)
                self.update_numerical_node(right, left.beginning, False)
                self.update_numerical_splits_if_siblings(parent_node, feature, value, left)
            elif right.end is not None and value > right.end:
                parent_node = self.get_node(left.parent_id)
                self.update_numerical_node(left, right.end, True)
                self.update_numerical_splits_if_siblings(parent_node, feature, value, right)
            else:
                self.update_numerical_node(left, value, True)
                self.update_numerical_node(right, value, False)
        else:
            added, removed = set(value) - set(left.values), set(left.values) - set(value)
            self.update_categorical_node(left, added, removed)
            self.update_categorical_node(right, added, removed)
        return self.jsonify_nodes()

    def update_numerical_node(self, node, value, is_left):
        node.update(value, is_left)
        nodes = deque([node.id])
        while nodes:
            node = self.get_node(nodes.popleft())
            self.set_node_info(node)
            nodes += node.children_ids

    def update_numerical_splits_if_siblings(self, parent_node, feature, value, moved_node):
        left, right = None, self.get_node(parent_node.children_ids[0])
        right_idx = 0
        while right is not None and (right.end is None or right.end < value):
            right_idx += 1
            left = right
            if right_idx < len(parent_node.children_ids):
                right = self.get_node(parent_node.children_ids[right_idx])
            else:
                right = None
        if right is None:
            moved_node.end = None
            self.update_numerical_node(moved_node, value, False)
            parent_node.children_ids.remove(moved_node.id)
            parent_node.children_ids.append(moved_node.id)
            self.update_numerical_node(left, value, True)
        else:
            remove_first = False
            if moved_node.end is None or moved_node.end > right.end:
                remove_first = True
            moved_node.beginning = None
            self.update_numerical_node(moved_node, value, True)
            if left is not None:
                self.kill_children(right)
                self.kill_children(moved_node)
                self.update_numerical_node(moved_node, right.beginning, False)
            if remove_first:
                parent_node.children_ids.remove(moved_node.id)
                parent_node.children_ids.insert(right_idx, moved_node.id)
            else:
                parent_node.children_ids.insert(right_idx, moved_node.id)
                parent_node.children_ids.remove(moved_node.id)

            self.update_numerical_node(right, value, False)

    def update_categorical_node(self, node, added, removed):
        node.update(added, removed)
        nodes = deque([node.id])
        while nodes:
            node = self.get_node(nodes.popleft())
            self.set_node_info(node)
            nodes += node.children_ids

    def delete_split(self, feature, left_id, right_id, parent_id):
        left, right, parent = self.get_node(left_id), self.get_node(right_id), self.get_node(parent_id)
        self.delete_node(left, parent)
        if len(parent.children_ids) == 1:
            self.delete_node(right, parent)
            self.features[left.feature]["nr_uses"] -= 1
            self.leaves.add(parent.id)
        else:
            if left.get_type() == Node.TYPES.NUM:
                self.update_numerical_node(right, left.beginning, False)
            else:
                self.update_categorical_node(right, None, left.values)
        return self.jsonify_nodes()

    def add_node(self, node, idx=None):
        super(InteractiveTree, self).add_node(node)
        parent_node = self.get_node(node.parent_id)
        if parent_node is not None:
            if idx is None:
                parent_node.children_ids.append(node.id)
            else:
                parent_node.children_ids.insert(idx, node.id)
        self.set_node_info(node)

    def delete_node(self, node, parent_node):
        self.kill_children(node)
        del self.nodes[node.id]
        parent_node.children_ids.remove(node.id)
        self.leaves.remove(node.id)

    def kill_children(self, node):
        self.leaves.add(node.id)
        to_delete = node.children_ids
        if to_delete:
            self.features[self.get_node(to_delete[0]).feature]["nr_uses"] -= 1
        while to_delete:
            index = to_delete.pop(0)
            children = self.get_node(index).children_ids
            to_delete += children
            if children:
                self.features[self.get_node(children[0]).feature]["nr_uses"] -= 1
            else:
                self.leaves.remove(index)
            del self.nodes[index]

    def jsonify(self):
        return {"name": self.name,
                "last_index": self.last_index,
                "target": self.target,
                "target_values": self.target_values,
                "features": self.features,
                "nodes": self.jsonify_nodes(),
                "sample_method": self.sample_method,
                "sample_size": self.sample_size}

    def jsonify_nodes(self):
        jsonified_tree = {}
        for key, node in self.nodes.items():
            jsonified_tree[key] = node.jsonify()
        return jsonified_tree

    @staticmethod
    def get_features_with_meanings(df, target, feature_dict):
        if feature_dict is None:
            feature_dict = {}
        numerical_feature_set = set()
        for col_name in df.columns:
            if col_name != target:
                if col_name not in feature_dict:
                    feature_dict[col_name] = {"nr_uses": 0}
                col = df.loc[:, col_name]
                if pd.api.types.is_numeric_dtype(col) and col.nunique() > 10:
                    feature_dict[col_name]["mean"] = col.mean()
                    numerical_feature_set.add(col_name)
                else:
                    feature_dict[col_name].pop("mean", None)
                    if col.dtype == "bool":
                        df.loc[:, col_name] = df.loc[:, col_name].apply(safe_str)
        return feature_dict, numerical_feature_set
