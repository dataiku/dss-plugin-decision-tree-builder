import pandas as pd
from dku_idtb_decision_tree.autosplit import autosplit

df = pd.DataFrame([
                    [5, "y", "x", "B"],
                    [1.1, "x", "x", "A"],
                    [.4, "x", "y", "A"],
                    [7, "y", "y", "B"],
                    [-2, "z", "z", "C"],
                    [-5, "z", "z", "C"]
                ], columns=("num", "cat", "cat_bis", "target"))

def test_autosplit_cat():
    splits = autosplit(df, "cat", "target", False, 4)
    assert splits == [["x"], ["y"], ["z"]]
    splits = autosplit(df, "cat", "target", False, 3)
    assert splits == [["x"], ["y"], ["z"]]
    splits = autosplit(df, "cat", "target", False, 2)
    assert splits == [["x"], ["y"]]
    splits = autosplit(df, "cat", "target", False, 1)
    assert splits == [["x"]]

    splits = autosplit(df, "cat_bis", "target", False, 1)
    assert splits == [["z"]]
    splits = autosplit(df, "cat_bis", "target", False, 2)
    assert splits == [["z"]]

    splits = autosplit(df[df.num < 0], "cat", "target", False, 2)
    assert splits == []

def test_autosplit_num():
    splits = autosplit(df, "num", "target", True, 4)
    assert len(splits) == 2
    assert -2 < splits[0] < 1.1
    assert 1.1 < splits[1] < 5

    splits = autosplit(df, "num", "target", True, 1)
    assert len(splits) == 1
    assert -2 < splits[0] < 1.1

    splits = autosplit(df[df.num < 0], "num", "target", True, 2)
    assert splits == []
