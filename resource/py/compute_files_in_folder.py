from dataiku import Folder

def do(payload, config, plugin_config, inputs):
    for recipe_input in inputs:
        if recipe_input["role"] == "folder":
            folder = Folder(recipe_input["fullName"])
    paths = folder.list_paths_in_partition()
    choices = []
    for fileName in paths:
        if ".json" in fileName:
            jsonFile = folder.read_json(fileName)
            choices.append({"value": fileName,
                            "label": fileName + " (" + jsonFile["name"] + " | " + jsonFile["target"] + ")"})
    return {"choices": choices}