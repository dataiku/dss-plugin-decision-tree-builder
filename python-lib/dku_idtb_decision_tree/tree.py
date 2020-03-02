from dku_idtb_decision_tree.node import Node, CategoricalNode, NumericalNode
from dku_idtb_compatibility.utils import safe_str
from collections import deque
import pandas as pd


class Tree(object):
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
    def __init__(self, df, name, target, target_values=None, sample_method='head', sample_size=None, nodes=None, last_index=1,
                 features=None, new_sampling=False):
        try:
            self.df = df.dropna(subset=[target])
        except KeyError:
            raise Exception("The target %s is not one of the columns of the dataset" % target)
        self.name = name
        self.last_index = last_index
        self.target = target
        if target_values is None:
            self.target_values = list(self.df[target].unique())
        else:
            self.target_values = target_values
        self.sample_method = sample_method
        self.sample_size = sample_size
        self.leaves = set()
        if nodes is None:
            self.nodes = {}
            root = Node(0, -1, set())
            self.add_node(root, None)
        else:
            self.parse_nodes(nodes)
        if features is None:
            self.features = {}
            self.get_features_with_meanings(df)
        else:
            self.features = features
        if new_sampling:
            for node in self.nodes.values():
                self.set_node_info(node)

    def change_meaning(self, i, feature):
        node = self.get_node(i)
        if feature in node.treated_as_numerical:
            node.treated_as_numerical.remove(feature)
        else:
            node.treated_as_numerical.add(feature)
        return self.get_stats(i, feature)

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

    @staticmethod
    def _get_target_distrib_dict(target_distrib, target_values_are_floats):
        if target_values_are_floats:
            target_distrib_parsed = {}
            for target_value, count in target_distrib.items():
                if target_value.is_intger():
                    target_distrib_parsed[int(target_value)] = count
                else:
                    target_distrib_parsed[target_value] = count
        return target_distrib.to_dict()

    def get_stats(self, i, col):
        node = self.get_node(i)
        filtered_df = self.get_filtered_df(node, self.df)
        column = filtered_df[col]
        target_column = filtered_df[self.target]
        stats = {}
        target_values_are_floats = pd.api.types.is_float_dtype(target_column)
        if col in node.treated_as_numerical:
            if not column.empty:
                stats.update({"mean": column.mean(), "max": column.max(), "min": column.min()})
                target_grouped = target_column.groupby(pd.cut(column.fillna(self.features[col]["mean"]),
                                                              bins = min(10, column.nunique()),
                                                              include_lowest = True,
                                                              right = False))
                target_distrib = target_grouped.apply(lambda x: x.value_counts())
                col_distrib = target_grouped.count()
                stats["bins"] = []
                for interval, count in col_distrib.items():
                    stats["bins"].append({"value": safe_str(interval),
                                          "target_distrib": Tree._get_target_distrib_dict(target_distrib[interval], target_values_are_floats) if count > 0 else {},
                                          "mid": interval.mid,
                                          "count": count})
            else:
                stats["no_values"] = True
            return stats

        stats["bins"] = []
        empty_values = set(self.df[col].dropna().apply(safe_str).unique())
        if not column.empty:
            target_grouped = target_column.groupby(column.fillna("No values").apply(safe_str))
            target_distrib = target_grouped.value_counts(dropna=False)
            col_distrib = target_grouped.count().sort_values(ascending=False)
            empty_values -= set(col_distrib.index)
            stats["same_target_distrib"] = True
            for value in col_distrib.index:
                stats["bins"].append({"value": value,
                                      "target_distrib": Tree._get_target_distrib_dict(target_distrib[value], target_values_are_floats),
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
                return self.add_numerical_split_no_siblings(parent_node, feature, value)
            return self.add_numerical_split_if_siblings(parent_node, feature, value)
        return self.add_categorical_split(parent_node, feature, value)

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
            self.add_node(new_node, parent_node)
            self.update_numerical_node(left, value, True)
            return {"left": left.jsonify(), "right": new_node.jsonify(), "parent": parent_node.jsonify()}

        new_node = NumericalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, end=value)
        self.last_index += 1
        if left is not None:
            self.kill_children(right)
            new_node.beginning = left.end
        self.update_numerical_node(right, value, False)
        self.add_node(new_node, parent_node, right_idx)
        return {"left": new_node.jsonify(), "right": right.jsonify(), "parent": parent_node.jsonify()}

    def add_numerical_split_no_siblings(self, parent_node, feature, value):
        self.leaves.remove(parent_node.id)
        self.features[feature]["nr_uses"] += 1
        new_node_left = NumericalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, end=value)
        self.last_index += 1
        new_node_right = NumericalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, beginning=value)
        self.last_index += 1
        self.add_node(new_node_left, parent_node)
        self.add_node(new_node_right, parent_node)
        return {"left": new_node_left.jsonify(), "right": new_node_right.jsonify(), "parent": parent_node.jsonify()}

    def add_categorical_split(self, parent_node, feature, values):
        left = CategoricalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, values)
        self.last_index += 1
        if not parent_node.children_ids:
            self.features[feature]["nr_uses"] += 1
            right = CategoricalNode(self.last_index, parent_node.id, set(parent_node.treated_as_numerical), feature, list(values), others=True)
            self.leaves.remove(parent_node.id)
            self.last_index += 1
        else:
            right = self.get_node(parent_node.children_ids.pop())
            self.update_categorical_node(right, values, None)

        self.add_node(left, parent_node)
        self.add_node(right, parent_node)
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
                right.beginning = left.beginning
            else:
                right.update(removed=left.values)
            self.set_node_info(right)

    def add_node(self, node, parent_node, idx=None):
        self.nodes[node.id] = node
        self.leaves.add(node.id)
        self.set_node_info(node)
        if parent_node is not None:
            if idx is None:
                parent_node.children_ids.append(node.id)
            else:
                parent_node.children_ids.insert(idx, node.id)

    def get_node(self, i):
        return self.nodes.get(i)

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

    def parse_nodes(self, nodes):
        self.nodes, ids = {}, deque()
        node = Node(0, -1, set(nodes["0"]["treated_as_numerical"]))
        node.rebuild(nodes["0"]["children_ids"],
                     nodes["0"]["prediction"], nodes["0"]["samples"],
                     nodes["0"]["probabilities"],
                     nodes["0"]["label"])
        self.nodes[0] = node

        ids += node.children_ids
        if not ids:
            self.leaves.add(node.id)
        while ids:
            dict_node = nodes[safe_str(ids.popleft())]
            if dict_node.get("values") is not None:
                node = CategoricalNode(dict_node.pop("id"),
                                       dict_node.pop("parent_id"),
                                       set(dict_node.pop("treated_as_numerical")),
                                       dict_node.pop("feature"),
                                       dict_node.pop("values"),
                                       others=dict_node.pop("others"))
            else:
                node = NumericalNode(dict_node.pop("id"),
                                     dict_node.pop("parent_id"),
                                     set(dict_node.pop("treated_as_numerical")),
                                     dict_node.pop("feature"),
                                     beginning=dict_node.pop("beginning", None),
                                     end=dict_node.pop("end", None))
            node.rebuild(**dict_node)
            if not node.children_ids:
                self.leaves.add(node.id)
            self.nodes[node.id] = node
            ids += node.children_ids

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


    def get_features_with_meanings(self, df):
        for col_name in df.columns:
            if col_name != self.target:
                self.features[col_name] = {"nr_uses": 0}
                col = df.loc[:, col_name]
                if pd.api.types.is_numeric_dtype(col):
                    if col.nunique() > 10:
                        self.features[col_name]["mean"] = col.mean()
                        self.get_node(0).treated_as_numerical.add(col_name)
