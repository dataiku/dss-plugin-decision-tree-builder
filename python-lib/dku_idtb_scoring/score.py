import pandas as pd
from dku_idtb_compatibility.utils import safe_str

def check(df, tree, check_prediction):
    for col_name, col_usage in tree.features.items():
        if col_usage["nr_uses"] > 0:
            if col_name not in df.columns:
                raise ValueError("The column %s is missing in the input dataset" % col_name)

def score_chunk(tree, df, check_prediction):
    filtered_dfs = []
    for leaf_id in tree.leaves:
        leaf = tree.get_node(leaf_id)
        filtered_df = tree.get_filtered_df(leaf, df)
        for proba in leaf.probabilities:
            filtered_df["proba_" + safe_str(proba[0])] = proba[1]
        filtered_df["prediction"] = leaf.prediction
        if check_prediction and leaf.prediction is not None:
            filtered_df["prediction_correct"] = filtered_df[tree.target] == leaf.prediction
        filtered_df["label"] = leaf.label
        filtered_dfs.append(filtered_df)
    return filtered_dfs

def score(tree, input_dataset, chunk_size_param, check_prediction):
    dfs = []
    first_chunk = True
    for df in input_dataset.iter_dataframes(chunksize=chunk_size_param):
        if first_chunk:
            check(df, tree, check_prediction)
            first_chunk = False
        dfs += score_chunk(tree, df, check_prediction)
    full_df = pd.concat(dfs).sort_index()
    proba_columns = ["proba_" + safe_str(target_value) for target_value in tree.target_values]
    full_df[proba_columns] = full_df[proba_columns].fillna(0)
    return full_df

def write_with_schema(tree, input_dataset, scored_dataset, scored_df, output_probabilities, check_prediction):
    schema = input_dataset.read_schema()
    if output_probabilities:
        for value in tree.target_values:
            schema.append({'type': 'double', 'name': "proba_" + safe_str(value)})
    schema.append({'type': 'string', 'name': 'prediction'})
    if check_prediction:
        schema.append({'type': 'boolean', 'name': 'prediction_correct'})
    schema.append({'type': 'string', 'name': 'label'})

    scored_dataset.write_schema(schema)

    with scored_dataset.get_writer() as writer:
        writer.write_dataframe(scored_df)
