import math
import pandas as pd
from sklearn.tree import _tree, DecisionTreeClassifier
from dku_idtb_compatibility.utils import safe_str

def apply_cross_entropy(population):
    return lambda sample: pd.Series(cross_entropy(population, sample), index=sample.index)

def cross_entropy(population_distrib, sample):
    sample_distrib = sample.value_counts(normalize=True)
    entropy = 0
    for value, perc in sample_distrib.items():
        entropy -= population_distrib[value]*math.log(perc, 2)
    return entropy

def convert_categorical_columns(feature_col, target_col):
    target_distrib = target_col.value_counts(normalize=True)
    entropies = target_col.groupby(feature_col).apply(apply_cross_entropy(target_distrib))
    return entropies.sort_index()

def autosplit(df, feature, target, numerical, max_splits):
    if len(df[target].unique()) < 2:
        return []
    if numerical:
        return compute_splits(df[[feature]], df[target], max_splits)
    entropies = convert_categorical_columns(df[feature], df[target])
    if max(entropies) == 0:
        return [[x] for x in sorted(df[feature].unique())[:max_splits]]
    splits = compute_splits(entropies.to_frame(), df[target], max_splits)
    reconverted_splits = []
    for split in splits:
        reconverted_splits.append(df[feature][entropies < split].unique().tolist())
        df = df[entropies >= split]
        entropies = entropies[entropies >= split]
    return reconverted_splits

def compute_splits(feature_df, target_col, max_num_splits):
    """
    For the chosen feature, we fit a Decision Tree to find the best set of parameters.
    With that optimal Decision Tree, we retrieve the list of rules to get to the leaves.
    Parameters
    ----------
    feature_df : pandas.DataFrame
        Dataframe with only the feature column. NaN values have been dropped.
    target_col : pandas.Series
        Target column. Rows where feature was NaN have been dropped.
    max_num_splits : int
        Upper bound for the number of splits to be formed.
    Returns
    -------
    thresholds : list
        values of each split
    """
    tree_estimator = DecisionTreeClassifier(max_leaf_nodes=max_num_splits+1,
                                            class_weight='balanced',
                                            presort=True,
                                            random_state=1407)

    tree_estimator.fit(feature_df, target_col.apply(safe_str))
    thresholds = tree_estimator.tree_.threshold[tree_estimator.tree_.children_left != _tree.TREE_LEAF]
    return sorted(thresholds)
