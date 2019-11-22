import sys

def safe_str(val):
    if sys.version_info > (3, 0):
        return str(val)
    if isinstance(val, unicode):
        return val.encode("utf-8")
    return str(val)

def safe_write_json(jsonified_tree, folder, filename):
    if sys.version_info > (3, 0):
        from io import StringIO
    else:
        from StringIO import StringIO
    from dataiku.core.dkujson import dumps
    tree_file = StringIO()
    tree_file.write(dumps(jsonified_tree))
    tree_file.seek(0)
    folder.upload_stream(filename, tree_file)
