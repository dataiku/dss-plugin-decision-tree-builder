import dataiku
from flask import jsonify, request
import traceback, json, logging
from dku_idtb_decision_tree.tree import InteractiveTree
from dku_idtb_decision_tree.tree_factory import TreeFactory
from dku_idtb_decision_tree.node import Node
from dku_idtb_decision_tree.autosplit import autosplit
from dku_idtb_tree_parsing.tree_parser import TreeParser
from dku_idtb_compatibility.utils import safe_write_json
from dku_idtb_model_parser.model_handler_utils import get_model_handler

from dataiku.core.dkujson import DKUJSONEncoder
app.json_encoder = DKUJSONEncoder

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="IDTB %(levelname)s - %(message)s")

# initialization of the backend
factory = TreeFactory()
folder_name = "FOLDER" # TODO

@app.route("/load", methods=["GET"])
def load():
    try:
        model_handler = get_model_handler()
        df = model_handler.get_train_df()[0]
        target = model_handler.get_target_variable()
        tree = InteractiveTree(df, name=None, target=target, sample_method=None, sample_size=None)
        tree_parser = TreeParser(model_handler)
        tree_parser.parse_nodes(tree, df) 
        factory.set_tree(folder_name, tree)
        return jsonify(nodes=tree.jsonify_nodes(), target_values=tree.target_values, target=target, features=tree.features)
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

#cache = {}
@app.route("/save", methods=["POST"])
def save():
    try:
        data = json.loads(request.data)
        safe_write_json(factory.get_tree(folder_name).jsonify(), folder, data["filename"])
        return json.dumps({"status": "Tree saved"})
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/select-node/<int:node_id>/<feature>")
def get_stats_node(node_id, feature):
    try:
        return jsonify(factory.get_tree(folder_name).get_stats(node_id, feature))
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/set-label", methods=['POST'])
def set_label():
    data = json.loads(request.data)
    node = factory.get_tree(folder_name).get_node(data["node_id"])
    node.label = data.get("label")
    if node.label is None:
        return json.dumps({"status": "Node label deleted"})
    return json.dumps({"status": "New node label set"})

@app.route("/change-meaning", methods=["POST"])
def change_meaning():
    try:
        data = json.loads(request.data)
        tree = factory.get_tree(folder_name)
        updated_hist_data = tree.change_meaning(data["node_id"], data["feature"])
        return jsonify(updated_hist_data)
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/add-split", methods=["POST"])
def add_split():
    try:
        tree, data = factory.get_tree(folder_name), json.loads(request.data)
        return jsonify(tree.add_split(**data))
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/update-split", methods=["POST"])
def update_split():
    try:
        tree, data = factory.get_tree(folder_name), json.loads(request.data)
        return jsonify(tree.update_split(**data))
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/delete-split", methods=["DELETE"])
def delete_split():
    try:
        tree, data = factory.get_tree(folder_name), json.loads(request.data)
        return jsonify(tree.delete_split(**data))
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/delete-all-splits", methods=["DELETE"])
def delete_all_splits():
    try:
        tree, data = factory.get_tree(folder_name), json.loads(request.data)
        tree.kill_children(tree.get_node(data["parent_id"]))
        tree.leaves.add(data["parent_id"])
        return jsonify(tree.jsonify_nodes())
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/auto-split", methods=["POST"])
def auto_split():
    try:
        data = json.loads(request.data)
        node_id, feature, max_splits = data["nodeId"], data["feature"], data["maxSplits"]
        tree = factory.get_tree(folder_name)
        node = tree.get_node(node_id)
        df = tree.get_filtered_df(node, tree.df).dropna(subset=[feature])
        split_values = autosplit(df, feature, tree.target, feature in node.treated_as_numerical, max_splits)
        for value in split_values:
            tree.add_split(node.id, feature, value)
        return jsonify(tree.jsonify_nodes())
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500
