class TreeFactory(object):
    def __init__(self):
        self.trees = {}

    def get_tree(self, key):
        return self.trees[key]

    def set_tree(self, key, tree):
        self.trees[key] = tree