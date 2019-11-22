from dataiku.customrecipe import get_input_names_for_role, get_output_names_for_role, get_recipe_config
from dku_idtb_decision_tree.tree import Tree
from dku_idtb_scoring.score import score, write_with_schema

input_dataset = dataiku.Dataset(get_input_names_for_role("input_dataset")[0])
scored_dataset = dataiku.Dataset(get_output_names_for_role("scored_dataset")[0])
folder = dataiku.Folder(get_input_names_for_role("folder")[0])
chunk_size_param = get_recipe_config()["chunk_size"]

try:
    tree = folder.read_json(get_recipe_config()["tree_file"])
except ValueError:
    raise Exception("No tree file named " + get_recipe_config()["tree_file"])

tree["df"] = input_dataset.get_dataframe()
tree = Tree(**tree)

scored_df = score(tree, input_dataset, chunk_size_param, False)
write_with_schema(tree, input_dataset, scored_dataset, scored_df, True, False)
