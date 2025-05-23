import pandas as pd
import numpy as np
from dku_idtb_scoring.score import add_scoring_columns, get_scored_df_schema
from dku_idtb_decision_tree.tree import ScoringTree
from pytest import raises


nodes = {
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
		"values": ["u","v"],
		"prediction": "B",
		"others": False,
		"children_ids": [],
		"probabilities": [["B", 0.75], ["A", 0.25]],
		"samples": 0,
		"label": None
	},
	"4": {
		"id": 4,
		"parent_id": 2,
		"treated_as_numerical": {"num": None},
		"feature": "cat",
		"values": ["u", "v"],
		"others": True,
		"prediction": None,
		"children_ids": [],
		"probabilities": None,
		"samples": 200,
		"label": "general Kenobi"
	}
}
features = {"num": {"nr_uses": 1, "mean": 3.5}, "cat": {"nr_uses": 1}}
tree = ScoringTree("target", ["A", "B"], nodes, features)

def get_input_df():
	return pd.DataFrame([[.2, "u", "A"],
						[7, np.nan, "B"],
						[4, "u", "A"],
						[3, "v", "A"],
						[np.nan, "u", "C"]], columns=("num", "cat", "target"))

def test_score():
	df = get_input_df()
	add_scoring_columns(tree, df, True)
	expected_df = pd.DataFrame([
		[.2, "u", "A", .8, .2, "A", str(["num < 4"]), 1.0, "hello there"],
		[7, np.nan, "B", np.nan, np.nan, np.nan, str(["4 ≤ num", "cat not in {}".format(["u", "v"])]), 4.0, "general Kenobi"],
		[4, "u", "A", .25, .75, "B", str(["4 ≤ num", "cat in {}".format(["u", "v"])]), 3.0, None],
		[3, "v", "A", .8, .2, "A", str(["num < 4"]), 1.0, "hello there"],
		[np.nan, "u", "C", .8, .2, "A", str(["num < 4"]), 1.0, "hello there"]
	], columns=("num", "cat", "target", "proba_A", "proba_B", "prediction", "decision_rule", "leaf_id", "label"))
	pd.testing.assert_frame_equal(df, expected_df)

	df = get_input_df()
	add_scoring_columns(tree, df, False, True, False)
	expected_df = pd.DataFrame([
		[.2, "u", "A", "A", str(["num < 4"]), 1.0, "hello there"],
		[7, np.nan, "B", np.nan, str(["4 ≤ num", "cat not in {}".format(["u", "v"])]), 4.0, "general Kenobi"],
		[4, "u", "A", "B", str(["4 ≤ num", "cat in {}".format(["u", "v"])]), 3.0, None],
		[3, "v", "A", "A", str(["num < 4"]), 1.0, "hello there"],
		[np.nan, "u", "C", np.nan, str(["num < 4"]), 1.0, "hello there"]
	], columns=("num", "cat", "target", "prediction", "decision_rule", "leaf_id", "label"))
	pd.testing.assert_frame_equal(df, expected_df)

	df = get_input_df()
	add_scoring_columns(tree, df, False, True, True)
	expected_df = pd.DataFrame([
		[.2, "u", "A", "A", True, str(["num < 4"]), 1.0, "hello there"],
		[7, np.nan, "B", np.nan, np.nan, str(["4 ≤ num", "cat not in {}".format(["u", "v"])]), 4.0, "general Kenobi"],
		[4, "u", "A", "B", False, str(["4 ≤ num", "cat in {}".format(["u", "v"])]), 3.0, None],
		[3, "v", "A", "A", True, str(["num < 4"]), 1.0, "hello there"],
		[np.nan, "u", "C", np.nan, np.nan, str(["num < 4"]), 1.0, "hello there"]
	], columns=("num", "cat", "target", "prediction", "prediction_correct", "decision_rule", "leaf_id", "label"))
	pd.testing.assert_frame_equal(df, expected_df)

def get_input_schema():
	return [{"type": "double", "name": "num"}, {"type": "string", "name": "cat"}, {"type": "string", "name": "target"}]

def test_scored_df_schema():
	schema = get_scored_df_schema(tree, get_input_schema(), None, True)
	expected_schema = [
		{"type": "double", "name": "num"},
		{"type": "string", "name": "cat"},
		{"type": "string", "name": "target"},
		{"type": "double", "name": "proba_A"},
		{"type": "double", "name": "proba_B"},
		{"type": "string", "name": "prediction"},
		{"type": "array", "name": "decision_rule", "arrayContent": {"type": "string"}},
		{"type": "int", "name": "leaf_id"},
		{"type": "string", "name": "label"}
	]
	assert schema == expected_schema
	columns = []
	schema = get_scored_df_schema(tree, get_input_schema(), columns, False, True, False)
	expected_schema = [
		{"type": "string", "name": "prediction"},
		{"type": "array", "name": "decision_rule", "arrayContent": {"type": "string"}},
		{"type": "int", "name": "leaf_id"},
		{"type": "string", "name": "label"}
	]
	assert schema == expected_schema
	assert columns == ["prediction", "decision_rule", "leaf_id", "label"]

	columns = ["num"]
	schema = get_scored_df_schema(tree, get_input_schema(), columns, False, True, True)
	expected_schema = [
		{"type": "double", "name": "num"},
		{"type": "string", "name": "prediction"},
		{"type": "boolean", "name": "prediction_correct"},
		{"type": "array", "name": "decision_rule", "arrayContent": {"type": "string"}},
		{"type": "int", "name": "leaf_id"},
		{"type": "string", "name": "label"}
	]
	assert schema == expected_schema
	assert columns == ["num", "prediction", "prediction_correct", "decision_rule", "leaf_id", "label"]

	schema_missing_feature = [{"type": "double", "name": "num"}, {"type": "string", "name": "target"}]
	schema_missing_target = [{"type": "double", "name": "num"}, {"type": "string", "name": "cat"}]
	with raises(ValueError) as e:
		get_scored_df_schema(tree, schema_missing_feature, None, False)
		assert e.args[0] == "The column cat is missing in the input dataset"
	with raises(ValueError) as e:
		get_scored_df_schema(tree, schema_missing_target, None, False, True, True)
		assert e.args[0] == "The target target is missing in the input dataset"
