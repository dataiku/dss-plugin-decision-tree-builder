from dataiku.customrecipe import get_input_names_for_role, get_output_names_for_role, get_recipe_config
from dku_idtb_decision_tree.tree import ScoringTree
from dku_idtb_scoring.score import add_scoring_columns, get_scored_df_schema, get_metric_df_schema
from dku_idtb_compatibility.utils import safe_str
from dataiku.doctor.prediction.reg_evaluation_recipe import compute_multiclass_metrics, compute_binary_classification_metrics

input_dataset = dataiku.Dataset(get_input_names_for_role("inputDataset")[0])
folder = dataiku.Folder(get_input_names_for_role("folder")[0])
scored_dataset = dataiku.Dataset(get_output_names_for_role("scoredDataset")[0])
metrics_dataset = dataiku.Dataset(get_output_names_for_role("metricsDataset")[0])
recipe_config = get_recipe_config()

try:
    tree_dict = folder.read_json(recipe_config["treeFile"])
except ValueError:
    raise Exception("No tree file named " + recipe_config["treeFile"])

tree = ScoringTree(tree_dict["target"], tree_dict["target_values"], tree_dict["nodes"], tree_dict["features"])
columns = recipe_config["inputColumns"] if recipe_config["keepSomeColumns"] else None

scored_dataset.write_schema(get_scored_df_schema(tree, input_dataset.read_schema(), columns, recipe_config["outputProbabilities"], True, recipe_config["checkPrediction"]))
input_dataframe = input_dataset.get_dataframe()
input_dataframe.loc[:, tree.target] = input_dataframe.loc[:, tree.target].apply(safe_str)
add_scoring_columns(tree, input_dataframe, True, True, recipe_config["checkPrediction"])
prediction_col_not_na = ~input_dataframe.prediction.isna()

if not recipe_config["outputProbabilities"]:
    import pandas as pd
    probas_df = pd.DataFrame()
    for target_value in tree.target_values:
        probas_df["proba_" + target_value] = input_dataframe.pop("proba_" + safe_str(target_value))[prediction_col_not_na]
with scored_dataset.get_writer() as writer:
    if columns is None:
            writer.write_dataframe(input_dataframe)
    else:
        writer.write_dataframe(input_dataframe[columns])

input_dataframe = input_dataframe[prediction_col_not_na]
if recipe_config["outputProbabilities"]:
    probas_df = input_dataframe[["proba_" + safe_str(target_value) for target_value in tree.target_values]]
target_mapping = {safe_str(label): index for index, label in enumerate(tree.target_values)}
y_pred = input_dataframe["prediction"].map(lambda t: int(target_mapping[safe_str(t)]))
y_actual = input_dataframe[tree.target].map(lambda t: int(target_mapping[safe_str(t)]))

if len(tree.target_values) == 2:
    metrics_dict = compute_binary_classification_metrics({"metrics": {"evaluationMetric": None, "liftPoint": 0.4}}, y_actual, y_pred, probas_df.values)
    metrics = ["precision", "recall", "f1", "accuracy", "auc",  "hammingLoss", "logLoss", "calibrationLoss"]
else:
    metrics_dict = compute_multiclass_metrics({"metrics": {"evaluationMetric": None, "liftPoint": 0.4}}, y_actual, y_pred, probas_df.values)
    metrics = ["precision", "recall", "f1", "accuracy", "mrocAUC", "logLoss", "hammingLoss", "mcalibrationLoss"]

metrics_dataset.write_schema(get_metric_df_schema(metrics_dict, metrics, recipe_config))
with metrics_dataset.get_writer() as writer:
    writer.write_row_dict(metrics_dict)
