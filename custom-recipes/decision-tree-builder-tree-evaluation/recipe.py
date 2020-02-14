from dataiku.customrecipe import get_input_names_for_role, get_output_names_for_role, get_recipe_config
import pandas as pd
from dku_idtb_decision_tree.tree import Tree
from dku_idtb_scoring.score import score, write_with_schema
from dku_idtb_compatibility.utils import safe_str
from dataiku.doctor.prediction.reg_evaluation_recipe import compute_multiclass_metrics, compute_binary_classification_metrics

input_dataset = dataiku.Dataset(get_input_names_for_role("input_dataset")[0])
scored_dataset = dataiku.Dataset(get_output_names_for_role("scored_dataset")[0])
metrics_dataset = dataiku.Dataset(get_output_names_for_role("metrics_dataset")[0])
folder = dataiku.Folder(get_input_names_for_role("folder")[0])
chunk_size_param = get_recipe_config()["chunk_size"]

try:
    tree = folder.read_json(get_recipe_config()["tree_file"])
except ValueError:
    raise Exception("No tree file named " + get_recipe_config()["tree_file"])

tree["df"] = input_dataset.get_dataframe()
tree = Tree(**tree)

scored_df = score(tree, input_dataset, chunk_size_param, True)

target_mapping = {safe_str(label): index for index, label in enumerate(tree.target_values)}
scored_df_nona = scored_df.dropna(subset=["prediction"])
y_actual, y_pred = scored_df_nona[tree.target], scored_df_nona.prediction
y_actual = y_actual.map(lambda t: int(target_mapping[safe_str(t)]))
y_pred = y_pred.map(lambda t: int(target_mapping[safe_str(t)]))

if len(tree.target_values) > 2:
    compute_metrics = compute_multiclass_metrics
    metrics = ["precision", "recall", "accuracy", "mrocAUC", "logLoss", "hammingLoss", "mcalibrationLoss"]
else:
    compute_metrics = compute_binary_classification_metrics
    metrics = ["precision", "recall", "accuracy", "auc",  "hammingLoss", "logLoss", "calibrationLoss"]

sorted_classes = sorted(target_mapping, key=lambda label: target_mapping[label])

if get_recipe_config()["probabilities"]:
    probas = scored_df_nona[["proba_" + safe_str(label) for label in sorted_classes]]
else:
    probas = pd.DataFrame()
    for value in sorted_classes:
        probas["proba_" + value] = scored_df_nona.pop("proba_" + safe_str(value))

metrics_dict = compute_metrics({"metrics": {"evaluationMetric": None, "liftPoint": 0.4}}, y_actual, y_pred, probas.values)
schema_metrics = []
for metric in metrics:
    if metric == "mcalibrationLoss":
        metric = "calibrationLoss"
    if metric == "mrocAUC":
        metric = "auc"
    if get_recipe_config()["filterMetrics"] and not get_recipe_config()[metric]:
        metrics_dict.pop(metric, "None")
    else:
        schema_metrics.append({"type": "float", "name": metric})

write_with_schema(tree, input_dataset, scored_dataset, scored_df_nona, get_recipe_config()["probabilities"], True)
metrics_dataset.write_schema(schema_metrics)
with metrics_dataset.get_writer() as writer:
    writer.write_row_dict(metrics_dict)
