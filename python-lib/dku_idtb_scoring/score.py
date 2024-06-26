from dku_idtb_compatibility.utils import safe_str
from datetime import datetime

def check_input_schema(tree, col_set, check_prediction):
    for col_name, col_usage in tree.features.items():
        if col_usage["nr_uses"] > 0:
            if col_name not in col_set:
                raise ValueError("The column %s is missing in the input dataset" % col_name)
    if check_prediction and tree.target not in col_set:
        raise ValueError("The target %s is missing in the input dataset" % tree.target)

def update_input_schema(input_schema, columns):
    col_set = set(columns)
    new_input_schema = []
    for column in input_schema:
        if column["name"] in col_set:
            new_input_schema.append(column)
    return new_input_schema

def _add_column(name, type, schema, columns=None):
    col = {'type': type, 'name': name}
    if type == 'array':
        col['arrayContent'] = {'type': 'string'}
    schema.append(col)
    if columns is not None:
        columns.append(name)

def get_scored_df_schema(tree, schema, columns, output_probabilities, is_evaluation=False, check_prediction=False):
    check_input_schema(tree, set(column["name"] for column in schema), is_evaluation)
    if columns is not None:
        schema = update_input_schema(schema, columns)
    if output_probabilities:
        for value in tree.target_values:
            _add_column('proba_' + safe_str(value), 'double', schema, columns)
    _add_column('prediction', 'string', schema, columns)
    if check_prediction:
        _add_column('prediction_correct', 'boolean', schema, columns)
    _add_column('decision_rule', 'array', schema, columns)
    _add_column('leaf_id', 'int', schema, columns)
    _add_column('label', 'string', schema, columns)
    return schema

def get_metric_df_schema(metrics_dict, metrics, recipe_config):
    schema_metrics = [{"type": "string", "name": "date"}]
    for metric in metrics:
        if metric == "mcalibrationLoss":
            metric_name_in_config = "calibrationLoss"
        elif metric == "mrocAUC":
            metric_name_in_config = "auc"
        else:
            metric_name_in_config = metric
        if recipe_config["filterMetrics"] and not recipe_config[metric_name_in_config]:
            metrics_dict.pop(metric, "None")
        else:
            schema_metrics.append({"type": "float", "name": metric})
    metrics_dict["date"] = datetime.now()
    return schema_metrics

def add_scoring_columns(tree, df, output_probabilities, is_evaluation=False, check_prediction=False):
    for leaf_id in tree.leaves:
        leaf = tree.get_node(leaf_id)
        if leaf.prediction is not None:
            filtered_df = tree.get_filtered_df(leaf, df)
            if is_evaluation:
                filtered_df = filtered_df[filtered_df[tree.target].isin(tree.target_values)]
            filtered_df_indices = filtered_df.index

            if output_probabilities:
                remaining_target_classes = set(tree.target_values)
                for target_class_name, proba in leaf.probabilities:
                    df.loc[filtered_df_indices, "proba_"+safe_str(target_class_name)] = proba
                    remaining_target_classes.remove(target_class_name)
                for target_class_name in remaining_target_classes:
                    df.loc[filtered_df_indices, "proba_"+safe_str(target_class_name)] = 0

            df.loc[filtered_df_indices, "prediction"] = leaf.prediction
            if check_prediction:
                df.loc[filtered_df_indices, "prediction_correct"] = filtered_df[tree.target] == leaf.prediction

        filtered_df = tree.get_filtered_df(leaf, df)
        df.loc[filtered_df.index, "decision_rule"] = safe_str(tree.get_decision_rule(leaf_id))
        df.loc[filtered_df.index, "leaf_id"] = leaf_id
        df.loc[filtered_df.index, "label"] = leaf.label
