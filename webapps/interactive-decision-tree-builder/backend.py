import dataiku
from dataiku.customwebapp import get_webapp_config
from flask import jsonify, request
import traceback, json, logging
from dku_idtb_decision_tree.tree import Tree
from dku_idtb_decision_tree.tree_factory import TreeFactory
from dku_idtb_decision_tree.node import Node
from dku_idtb_decision_tree.autosplit import autosplit
from dku_idtb_compatibility.utils import safe_str, safe_write_json

from dataiku.core.dkujson import DKUJSONEncoder
app.json_encoder = DKUJSONEncoder

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="IDTB %(levelname)s - %(message)s")

# initialization of the backend
try:
    folder_name = get_webapp_config()["input_folder"]
except KeyError:
    raise SystemError("No folder has been chosen in the settings of the webapp")

folder = dataiku.Folder(folder_name)
factory = TreeFactory()

#cache = {}

@app.route("/get-datasets")
def get_datasets():
    try:
        return jsonify(datasets=dataiku.Dataset.list())
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/get-files")
def get_files():
    try:
        return jsonify(files=folder.list_paths_in_partition())
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/get-config/<filename>")
def get_config(filename):
    try:
        file = folder.read_json(filename)
        return json.dumps({"sampleMethod": file["sample_method"], "sampleSize": file["sample_size"], "target": file["target"]})
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/get-features/<dataset>")
def get_features(dataset):
    try:
        return jsonify(features=[col_schema["name"] for col_schema in dataiku.Dataset(dataset).read_schema()])
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/create", methods=["POST"])
def create():
    try:
        data = json.loads(request.data)
        df = dataiku.Dataset(data["name"]).get_dataframe(sampling=data.get("sample_method", "head"), limit=data.get("sample_size"))
        tree = Tree(df, **data)
        factory.set_tree(folder_name, tree)
        return jsonify(tree.jsonify())
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/save", methods=["POST"])
def save():
    try:
        data = json.loads(request.data)
        safe_write_json(factory.get_tree(folder_name).jsonify(), folder, data["filename"])
        logging.info("Tree has been successfully saved")
        return json.dumps({"status": "Tree saved"})
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/load", methods=["POST"])
def load():
    try:
        data = json.loads(request.data)
        jsonified_tree = folder.read_json(data["filename"])
        new_sampling = data.get("sample_method") == "random" \
            or data.get("sample_method") != jsonified_tree.get("sample_method") \
            or data.get("sample_size") != jsonified_tree.get("sample_size")
        df = dataiku.Dataset(jsonified_tree["name"]).get_dataframe(sampling=data.get("sample_method", "head"),
                                                                limit=data.get("sample_size"))
        jsonified_tree["sample_method"] = data.get("sample_method", "head")
        jsonified_tree["sample_size"] = data.get("sample_size")
        tree = Tree(df, new_sampling=new_sampling, **jsonified_tree)
        factory.set_tree(folder_name, tree)
        return jsonify(tree.jsonify())
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
        logging.info("The label node has been deleted")
        return json.dumps({"status": "Node label deleted"})
    logging.info("The label node has been set to" + node.label)
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
        data = json.loads(request.data)
        return jsonify(factory.get_tree(folder_name).add_split(**data))
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/update-split", methods=["POST"])
def update_split():
    try:
        data = json.loads(request.data)
        return jsonify(factory.get_tree(folder_name).update_split(**data))
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/delete-split", methods=["DELETE"])
def delete_split():
    try:
        data = json.loads(request.data)
        tree = factory.get_tree(folder_name)
        tree.delete_split(**data)
        return jsonify({"nodes": tree.jsonify_nodes()})
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500

@app.route("/delete-all-splits", methods=["DELETE"])
def delete_all_splits():
    try:
        data = json.loads(request.data)
        tree = factory.get_tree(folder_name)
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
