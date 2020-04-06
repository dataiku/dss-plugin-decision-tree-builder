from dataiku.customrecipe import get_input_names_for_role, get_output_names_for_role, get_recipe_config
from dku_idtb_decision_tree.tree import ScoringTree
from dku_idtb_scoring.score import add_scoring_columns, get_scored_df_schema

input_dataset = dataiku.Dataset(get_input_names_for_role("inputDataset")[0])
scored_dataset = dataiku.Dataset(get_output_names_for_role("scoredDataset")[0])
folder = dataiku.Folder(get_input_names_for_role("folder")[0])
recipe_config = get_recipe_config()

try:
    tree_dict = folder.read_json(recipe_config["treeFile"])
except ValueError:
    raise Exception("No tree file named " + recipe_config["treeFile"])

tree = ScoringTree(tree_dict["target"], tree_dict["target_values"], tree_dict["nodes"], tree_dict["features"])

columns = recipe_config["inputColumns"] if recipe_config["keepSomeColumns"] else None
scored_dataset.write_schema(get_scored_df_schema(tree, input_dataset.read_schema(), columns, recipe_config["outputProbabilities"]))
writer = scored_dataset.get_writer()
for df in input_dataset.iter_dataframes(chunksize=recipe_config["chunkSize"]):
    add_scoring_columns(tree, df, recipe_config["outputProbabilities"])
    if columns is None:
        writer.write_dataframe(df)
    else:
        writer.write_dataframe(df[columns])
writer.close()