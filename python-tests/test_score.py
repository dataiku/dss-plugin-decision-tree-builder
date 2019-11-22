import pandas as pd
from dku_idtb_scoring.score import score_chunk
from dku_idtb_decision_tree.tree import Tree

tree_dict = {
	"name": "name",
	"last_index": 3,
	"target": "target",
	"target_values": ["A", "B"],
	"features": {
              "num": {"nr_uses": 1, "mean": 3.5}
	},
	"nodes": {
		"0": {
			"id": 0,
			"parent_id": -1,
			"treated_as_numerical": {"num": None},
			"feature": None,
			"prediction": "A",
			"children_ids": [1,2],
			"probabilities": [["A", 0.664], ["B", 0.336]],
			"samples": 500,
			"label": None
		},
		"1": {
			"id": 1,
			"parent_id": 0,
			"treated_as_numerical": {"num": None},
			"feature": "num",
			"end": 4,
			"prediction": "A",
			"children_ids": [],
			"probabilities": [["A", 0.800], ["B", 0.200]],
			"samples": 300,
			"label": "hello there"
		},
		"2": {
			"id": 2,
			"parent_id": 0,
			"treated_as_numerical": {"num": None},
			"feature": "num",
			"beginning": 4,
			"prediction": "A",
			"children_ids": [3,4],
			"probabilities": [["A", 0.800], ["B", 0.200]],
			"samples": 200,
			"label": None
		},
		"3": {
			"id": 3,
			"parent_id": 2,
			"treated_as_numerical": {"num": None},
			"feature": "cat",
			"values": ["u"],
			"prediction": "B",
			"others": False,
			"children_ids": [],
			"probabilities": [["B", 0.75], ["A", 0.25]],
			"samples": 100,
			"label": "general Kenobi"
		},
		"4": {
			"id": 4,
			"parent_id": 2,
			"treated_as_numerical": {"num": None},
			"feature": "cat",
			"values": ["u"],
			"others": True,
			"prediction": "B",
			"children_ids": [],
			"probabilities": [["B", 0.75], ["A", 0.25]],
			"samples": 100,
			"label": None
		}
	},
	"sample_method": "head",
	"sample_size": 10000
}

df = pd.DataFrame([[.2, "u", "A"],
                    [7, pd.np.nan, "B"],
                    [4, "u", "A"],
                    [3, "v", "A"],
                    [pd.np.nan, "u", "B"]], columns=("num", "cat", "target"))

expected_chunk_1 = pd.DataFrame([[.2, "u", "A", .8, .2, "A", True, "hello there"],
                                [3, "v", "A", .8, .2, "A", True, "hello there"],
                                [pd.np.nan, "u", "B", .8, .2, "A", False, "hello there"]],
                                columns=("num", "cat", "target", "proba_A", "proba_B", "prediction", "prediction_correct", "label"))
expected_chunk_2 = pd.DataFrame([[4, "u", "A", .25, .75, "B", False, "general Kenobi"]],
                                columns=("num", "cat", "target", "proba_A", "proba_B", "prediction", "prediction_correct",  "label"))
expected_chunk_3 = pd.DataFrame([[7, pd.np.nan, "B", .25, .75, "B", True, pd.np.nan]],
                                columns=("num", "cat", "target", "proba_A", "proba_B", "prediction", "prediction_correct", "label"))

expected_chunk_1.index = [0,3,4]
expected_chunk_2.index = [2]
expected_chunk_3.index = [1]

def check_equal(x, y):
    return x.combine(y, lambda x,y: x==y if not pd.isna(x) else pd.isna(y)).all()

def test_score():
    tree = Tree(pd.DataFrame(columns=["target"]), **tree_dict)
    chunk_1, chunk_2, chunk_3 = score_chunk(tree, df, True)
    expected_chunk_1.index = [0,3,4]

    assert chunk_1.combine(expected_chunk_1, check_equal).all(axis=None)
    assert chunk_2.combine(expected_chunk_2, check_equal).all(axis=None)
    assert chunk_3.combine(expected_chunk_3, check_equal).all(axis=None)
