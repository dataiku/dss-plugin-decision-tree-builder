import dataiku
import json
from dataiku.customrecipe import *
import logging

from dku_idtb_doctor_tree_parser.tree_parser import TreeParser


# init logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='Model Drift Recipe | %(levelname)s - %(message)s')

client = dataiku.api_client()
project = client.get_project(dataiku.default_project_key())

# Retrieve input model
logger.info("Retrieve the input model")
model_id = get_input_names_for_role('model')[0]

version_id = get_recipe_config().get('version_id')
if version_id is None:
    raise ValueError('Please choose a model version.')

file_name = get_recipe_config().get('file_name')
if file_name is None:
    raise ValueError('Please choose a filename.')

# Retrieve the output dataset for metrics and score
output_name = get_output_names_for_role('main_output')[0]
output_folder = dataiku.Folder(output_name)

tree_parser = TreeParser(model_id=model_id, version_id=version_id)
tree = tree_parser.build_tree()
tree_json = json.dumps(tree)

output_folder.write_json('{}.json'.format(file_name), tree)
