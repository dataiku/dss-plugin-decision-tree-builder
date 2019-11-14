import pandas as pd
from dku_idtb_decision_tree.tree import Tree

df = pd.DataFrame([
                    [1, 5.5, "x", "n", "A"],
                    [2, 7.7, "y", pd.np.nan, "A"],
                    [pd.np.nan, 7, "z", pd.np.nan, "B"],
                    [3, 1.2, "z", "n", "B"],
                    [4, 7.1, "z", pd.np.nan, "C"],
                    [5, .4, "x", "p", "A"],
                    [6, 8, "z", pd.np.nan, "A"],
                    [7, 5.5, "y", "p", "B"],
                    [8, 1.5, "z", "n", "B"],
                    [9, 3, "y", "n", "C"],
                    [10, 7.5, "x", pd.np.nan, "B"],
                    [11, 6, "x", pd.np.nan, "B"]
                ], columns=("num_1", "num_2", "cat_1", "cat_2", "target"))

def test_get_stats():
    tree = Tree(df, None, "target")
    stats_num_col = tree.get_stats(0, "num_1")
    assert stats_num_col["mean"] == 6
    assert stats_num_col["max"] == 11
    assert stats_num_col["min"] == 1
    last_bin = stats_num_col["bins"].pop()
    assert last_bin == {"count": 2, "target_distrib": {"B": 2}, "mid": (10+11.01)/2.0, "value": "[10.0, 11.01)"}
    assert stats_num_col["bins"][5] == {"count": 2, "target_distrib": {"A": 1, "B": 1}, "mid": (6+7)/2.0, "value": "[6.0, 7.0)"}
    for idx, current_bin in enumerate(stats_num_col["bins"]):
        if idx !=5:
            assert current_bin == {"count": 1, "target_distrib": {df[df.num_1 == (idx+1)].target.values[0]: 1},
                            "mid": (2*idx+3)/2.0, "value": "[{0}, {1})".format(float(idx+1), float(idx+2))}

    stats_cat_col = tree.get_stats(0, "cat_1")
    assert stats_cat_col["bins"] == [{"value": "z", "count": 5, "target_distrib": {"A": 1, "B": 3, "C": 1}}, 
                                    {"value": "x", "count": 4, "target_distrib": {"A": 2, "B": 2}},
                                    {"value": "y", "count": 3, "target_distrib": {"A": 1, "B": 1, "C": 1}}]
    assert stats_cat_col.get("same_target_distrib") is None

    tree = Tree(df.head(4), None, "target")
    assert tree.get_stats(0, "cat_2")["same_target_distrib"]

def check_node_info(node, samples, probabilities):
    assert node.samples == [samples, samples*100.0/12]
    assert node.probabilities == probabilities
    if probabilities:
        assert node.prediction == probabilities[0][0]
    else:
        assert node.prediction is None

def test_on_categorical_splits():
    tree = Tree(df, None, "target")
    _test_add_categorical_nodes(tree)
    _test_update_categorical_nodes(tree)
    _test_delete_categorical_node(tree)

def _test_add_categorical_nodes(tree):
    # add categorical split when parent node is a leaf
    tree.add_split(0, "cat_1", ["x", "y"])
    assert tree.leaves == set([1,2])
    assert tree.features["cat_1"]["nr_uses"] == 1
    assert tree.get_node(0).children_ids == [1,2]
    left_child, right_child = tree.get_node(1), tree.get_node(2)
    check_node_info(left_child, 7, [("A", round(3/7.0, 3)), ("B", round(3/7.0, 3)), ("C", round(1/7.0, 3))])
    assert not left_child.others

    check_node_info(right_child, 5, [("B", round(3/5.0, 3)), ("A", round(1/5.0, 3)), ("C", round(1/5.0, 3))])
    assert right_child.others

    # add categorical split when parent node is not a leaf
    tree.add_split(0, "cat_1", ["z"])
    assert tree.leaves == set([1,2,3])
    assert tree.features["cat_1"]["nr_uses"] == 1
    assert tree.get_node(0).children_ids == [1,3,2]
    middle_child, right_child = tree.get_node(3), tree.get_node(2)
    check_node_info(middle_child, 5, [("B", round(.6, 3)), ("A", round(.2, 3)), ("C", round(.2, 3))])
    assert not middle_child.others
    check_node_info(right_child, 0, [])
    assert tree.get_stats(2, "cat_1")["no_values"]
    assert len(tree.get_stats(2, "cat_1")) == 2
    assert right_child.others

    tree.add_split(1, "cat_2", ["n"])
    assert tree.leaves == set([2,3,4,5])
    assert tree.features["cat_1"]["nr_uses"] == 1 and tree.features["cat_2"]["nr_uses"] == 1
    assert tree.get_node(1).children_ids == [4,5]
    left_child, right_child = tree.get_node(4), tree.get_node(5)
    check_node_info(left_child, 2, [("A", .5), ("C", .5)])
    check_node_info(right_child, 5, [("B", .6), ("A", .4)])

def _test_update_categorical_nodes(tree):
    tree.update_split("cat_1", 1, 2, ["x"])
    left_node, right_node = tree.get_node(1), tree.get_node(2)
    check_node_info(left_node, 4, [("A", .5), ("B", .5)])
    check_node_info(right_node, 3, [("A", .333), ("B", .333), ("C", .333)])

    # check propagation of update to children
    left_child, right_child = tree.get_node(4), tree.get_node(5)
    check_node_info(left_child, 1, [("A", 1)])
    check_node_info(right_child, 3, [("B", .667), ("A", .333)])

def _test_delete_categorical_node(tree):
    tree.delete_split("cat_1", 1, 2, 0)
    assert tree.leaves == set([2,3])
    assert tree.features["cat_1"]["nr_uses"] == 1 and tree.features["cat_2"]["nr_uses"] == 0
    assert tree.get_node(0).children_ids == [3,2]
    assert tree.get_node(1) is None and tree.get_node(4) is None and tree.get_node(5) is None
    right_node = tree.get_node(2)
    check_node_info(right_node, 7, [("A", round(3/7.0, 3)), ("B", round(3/7.0, 3)), ("C", round(1/7.0, 3))])

    tree.delete_split("cat_1", 2, 3, 0)
    assert tree.leaves == set([0])
    assert tree.features["cat_1"]["nr_uses"] == 0
    assert not tree.get_node(0).children_ids
    assert tree.get_node(2) is None and tree.get_node(3) is None

def test_on_numerical_splits():
    tree = Tree(df, None, "target")
    _test_add_numerical_node(tree)
    _test_update_numerical_nodes(tree)
    _test_delete_numerical_node(tree)

def _test_add_numerical_node(tree):
    # add numerical split when parent node is a leaf
    tree.add_split(0, "num_2", 5)
    assert tree.leaves == set([1,2])
    assert tree.features["num_2"]["nr_uses"] == 1
    assert tree.get_node(0).children_ids == [1,2]
    node_1, node_2 = tree.get_node(1), tree.get_node(2)
    check_node_info(node_1, 4, [("B", .5), ("A", .25), ("C", .25)])
    check_node_info(node_2, 8, [("B", .5), ("A", .375), ("C", .125)])
    assert not node_1.beginning and node_1.end == 5
    assert not node_2.end and node_2.beginning == 5

    # add numerical split when parent node is not a leaf : insert node on the left
    tree.add_split(0, "num_2", 1)
    assert tree.leaves == set([1,2,3])
    assert tree.features["num_2"]["nr_uses"] == 1
    assert tree.get_node(0).children_ids == [3,1,2]
    node_3, node_1 = tree.get_node(3), tree.get_node(1)
    check_node_info(node_3, 1, [("A", 1)])
    check_node_info(node_1, 3, [("B", .667), ("C", .333)])
    assert not node_3.beginning and node_3.end == 1
    assert node_1.beginning == 1 and node_1.end == 5

    # add numerical split when parent node is not a leaf : split a node
    tree.add_split(0, "num_2", 3)
    assert tree.leaves == set([1,2,3,4])
    assert tree.features["num_2"]["nr_uses"] == 1
    assert tree.get_node(0).children_ids == [3,4,1,2]
    assert not node_3.beginning and node_3.end == 1
    assert tree.get_node(4).beginning == 1 and tree.get_node(4).end == 3
    assert node_1.beginning == 3 and node_1.end == 5

    tree.add_split(4, "num_1", 5)
    assert tree.leaves == set([1,2,3,5,6])
    assert tree.features["num_2"]["nr_uses"] == 1 and tree.features["num_1"]["nr_uses"] == 1
    assert tree.get_node(4).children_ids == [5,6]
    check_node_info(tree.get_node(5), 1, [("B", 1)])
    check_node_info(tree.get_node(6), 1, [("B", 1)])
    assert not tree.get_node(5).beginning and tree.get_node(5).end == 5
    assert tree.get_node(6).beginning == 5 and not tree.get_node(6).end

    # add numerical split when parent node is not a leaf : insert on the right
    tree.add_split(0, "num_2", 10)
    assert tree.leaves == set([1,2,3,5,6,7])
    assert tree.features["num_2"]["nr_uses"] == 1 and tree.features["num_1"]["nr_uses"] == 1
    assert tree.get_node(0).children_ids == [3,4,1,2,7]
    check_node_info(tree.get_node(7), 0, [])
    assert tree.get_stats(7, "num_2")["no_values"]
    assert len(tree.get_stats(7, "num_2")) == 1
    assert node_2.beginning == 5 and node_2.end == 10
    assert tree.get_node(7).beginning == 10 and not tree.get_node(7).end

def _test_update_numerical_nodes(tree):
    tree.update_split("num_2", 3, 4, 0)
    left_node, right_node = tree.get_node(3), tree.get_node(4)
    check_node_info(left_node, 0, [])
    assert tree.get_stats(3, "num_2")["no_values"]
    assert len(tree.get_stats(3, "num_2")) == 1
    check_node_info(right_node, 3, [("B", .667), ("A", .333)])
    assert not left_node.beginning and left_node.end == 0
    assert right_node.beginning == 0 and right_node.end == 3

    # check propagation of update to children
    left_child, right_child = tree.get_node(5), tree.get_node(6)
    check_node_info(left_child, 1, [("B", 1)])
    check_node_info(right_child, 2, [("A", .5), ("B", .5)])

    # check when update splits a node
    tree.update_split("num_2", 3, 4, 7)
    assert tree.leaves == set([1,2,3,4,7])
    assert tree.features["num_1"]["nr_uses"] == 0
    assert not tree.get_node(4).children_ids and tree.get_node(5) is None and tree.get_node(6) is None
    assert tree.get_node(0).children_ids == [3,1,4,2,7]
    check_node_info(tree.get_node(4), 3, [("B", .667), ("A", .333)])
    check_node_info(tree.get_node(2), 5, [("A", .4), ("B", .4), ("C", .2)])
    assert not tree.get_node(3).beginning and tree.get_node(3).end == 3

    assert tree.get_node(4).beginning == 5 and tree.get_node(4).end == 7
    assert tree.get_node(2).beginning == 7 and tree.get_node(2).end == 10
    assert tree.get_node(7).beginning == 10 and not tree.get_node(7).end

def _test_delete_numerical_node(tree):
    tree.delete_split("num_2", 1, 4, 0)
    assert tree.leaves == set([2,3,7,4])
    assert tree.features["num_2"]["nr_uses"] == 1
    assert tree.get_node(0).children_ids == [3,4,2,7]
    assert tree.get_node(1) is None
    left_node, right_node = tree.get_node(3), tree.get_node(4)
    assert not left_node.beginning and left_node.end == 3
    check_node_info(left_node, 3, [("B", .667), ("A", .333)])
    assert right_node.beginning == 3 and right_node.end == 7
    check_node_info(right_node, 4, [("B", .5), ("A", .25), ("C", .25)])
