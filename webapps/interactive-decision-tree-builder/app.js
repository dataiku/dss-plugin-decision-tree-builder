(function() {
    'use strict';

    app.controller("IdtbController", function($scope) {
        $scope.template = "create";
        $scope.setTemplate = function(newTemplate) {
            $scope.template = newTemplate;
        }
        $scope.error = {}
        $scope.removeErrModal = function (event) {
            if (event && !event.target.className.includes("fatal-error-background")) {
                return;
            }
            delete $scope.error.msg;
        }
        $scope.config = {};
    });

    app.controller("CreateOrLoadController", function($scope, $http) {
        $scope.config.sampleMethod = "head";
        $scope.config.newTree = true;
        $scope.$watch("config.newTree", function(nv) {
            if (nv) {
                delete $scope.config.file;
                delete $scope.config.target;
                $scope.config.sampleMethod = "head";
                $scope.config.sampleSize = 10000;
            } else {
                delete $scope.config.dataset;
                if (!$scope.files) {
                    $http.get(getWebAppBackendUrl("get-files"))
                    .then(function(response) {
                        $scope.files = response.data.files;
                    }, function(e) {
                        $scope.error.msg = e.data;
                    });
                }
            }
        });

        $scope.$watch("config.sampleMethod", function(nv, ov) {
            if(nv) {
                if (!ov) {
                    $scope.config.sampleSize = 10000;
                }
            } else {
                delete $scope.config.sampleSize;
            }
        });

        $http.get(getWebAppBackendUrl("get-datasets"))
        .then(function(response) {
            $scope.datasets = response.data.datasets;
        }, function(e) {
            $scope.error.msg = e.data;
        });

        $scope.$watch("config.dataset", function(nv) {
            if (nv) {
                $http.get(getWebAppBackendUrl("get-features/"+$scope.config.dataset))
                .then(function(response) {
                    $scope.features = response.data.features;
                }, function(e) {
                    $scope.error.msg = e.data;
                });
            } else {
                delete $scope.config.target;
            }
        });

        const fileConfig = {};
        $scope.$watch("config.file", function(nv) {
            if (nv) {
                if (!fileConfig[nv]) {
                    $http.get(getWebAppBackendUrl("get-config/"+nv))
                    .then(function(response) {
                        fileConfig[nv] = response.data;
                        if (!fileConfig[nv].sampleSize) {
                            delete fileConfig[nv].sampleMethod;
                        }
                        $scope.config.sampleMethod = fileConfig[nv].sampleMethod;
                        $scope.config.sampleSize = fileConfig[nv].sampleSize;
                        $scope.config.target = fileConfig[nv].target;
                    }, function(e) {
                        $scope.error.msg = e.data;
                    });
                } else {
                    $scope.config.sampleMethod = fileConfig[nv].sampleMethod;
                    $scope.config.sampleSize = fileConfig[nv].sampleSize;
                    $scope.config.target = fileConfig[nv].target;
                }
            }
        });

        $scope.edit = function() {
            $scope.setTemplate('edit');
        }
    });

    app.controller("EditController", function($scope, $http, $timeout, TreeInteractions, SunburstInteractions, Format) {
        const side = 30;
        const scale = ["#EC6547", "#FDC665", "#95C37B", "#75C2CC", "#694A82", "#538BC8", "#65B890", "#A874A0"];

        $scope.$watch("template", function(nv, ov) {
            if (ov == nv) {return;}
            if (ov == "viz") {
                d3.selectAll("[tooltip]").remove();
            }
            if (ov == "sun") {
                d3.select("#chart").select("svg").remove();
                d3.select("#leftsidebar").select("svg").remove();
                $scope.selectedNode = $scope.treeData[0];
            }
            if (nv == "viz") {
                $scope.setTemplate("viz");
                if (ov == "sun") {
                    $timeout(function() {
                        TreeInteractions.createTree($scope);
                        TreeInteractions.addVizTooltips($scope);
                    });
                }
                if (ov == "edit") {
                    TreeInteractions.addVizTooltips($scope);
                    $timeout(function() {
                        TreeInteractions.select(0, $scope);
                        $scope.zoomBack();
                    });
                }
            }
            if (nv == "edit") {
                $scope.setTemplate("edit");
                if (ov == "sun") {
                    $timeout(function() {
                        TreeInteractions.createTree($scope);
                    });
                }
                if (ov == "viz") {
                    $timeout(function() {
                        TreeInteractions.select(0, $scope);
                        $scope.zoomBack();
                    });
                }
            }
            if (nv == "sun") {
                d3.select(".tree").select("svg").remove();
                delete $scope.selectedNode;
                $scope.setTemplate("sun");
                $timeout(function() {
                    SunburstInteractions.createSun($scope.treeData, $scope.colors);
                });
            }
        });

        $scope.create = function(name, target, size, method) {
            $scope.loadingTree = true;
            $http.post(getWebAppBackendUrl("create"),
                {"name": name, "target": target, "sample_size": size, "sample_method": method})
            .then(function(response) {
                $scope.loadingTree = false;
                $scope.treeData = response.data.nodes;
                $scope.features = response.data.features;
                $scope.colors = {};
                angular.forEach(response.data.target_values, function(value, key) {
                    $scope.colors[value] = scale[key%scale.length];
                });
                TreeInteractions.createTree($scope);
                $scope.splits = {};
            }, function(e) {
                $scope.loadingTree = false;
                $scope.error.msg = e.data;
            });
        }

        $scope.load = function(filename, size, method) {
            $scope.loadingTree = true;
            $scope.isSaved = true;
            $http.post(getWebAppBackendUrl("load"), {"filename": filename, "sample_size": size, "sample_method": method})
            .then(function(response) {
                $scope.config.file = $scope.config.file.split(".json")[0].substring(1);
                $scope.features = response.data.features;
                $scope.treeData = response.data.nodes;
                $scope.splits = {};
                recreateSplits(Object.values(response.data.nodes));
                $scope.loadingTree = false;
                $scope.colors = {};
                angular.forEach(response.data.target_values, function(value, key) {
                    $scope.colors[value] = scale[key%scale.length];
                });
                TreeInteractions.createTree($scope);
            }, function(e) {
                $scope.loadingTree = false;
                $scope.error.msg = e.data;
            });
        }

        function recreateSplits(nodes) {
            nodes.forEach(function(node) {
                node.children_ids.forEach(function(elem, index) {
                    if (index === 0) {
                        $scope.splits[node.id] = [];
                    } else {
                        const split = {left: node.children_ids[index-1]};
                        if ($scope.treeData[elem].hasOwnProperty("beginning")) {
                            split.right = elem;
                            split.value = $scope.treeData[elem].beginning;
                        } else {
                            split.right = node.children_ids[node.children_ids.length - 1];
                            split.value = $scope.treeData[elem].values;
                        }
                        $scope.splits[node.id].push(split);
                    }
                });
            })
        }

        $scope.save = function() {
            const filename = prompt("Save as: ", $scope.config.file);
            if (filename) {
                $scope.config.file = filename;
                $http.post(getWebAppBackendUrl("save"), {"filename": filename + ".json"})
                .then(function() {
                    $scope.isSaved = true;
                }, function(e) {
                    $scope.error.msg = e.data;
                });
            }
        }

        $scope.close = function(force) {
            if (!$scope.isSaved && !force) {
                if (confirm("Are you sure you want to exit without saving? All unsaved changes will be lost.")) {
                    $scope.close(true);
                }
                return;
            }
            delete $scope.config.file;
            delete $scope.config.dataset;
            $scope.setTemplate('create');
        }

        $scope.zoomFit = function() {
            TreeInteractions.zoomFit($scope.template == "viz");
        }

        $scope.zoomBack = function() {
            TreeInteractions.zoomBack($scope.selectedNode);
        }

        $scope.toFixedIfNeeded = function(number, decimals, precision) {
            const lowerBound = 5 * Math.pow(10, -decimals-1);
            if (number && Math.abs(number) < lowerBound) {
                if (precision) { // indicates that number is very small instead of rounding to 0 (given that number is positive)
                    return "<" + lowerBound;
                }
                return 0;
            }
            return Format.toFixedIfNeeded(number, decimals);
        }

        $scope.editLabel = function() {
            let label = d3.select("#node-"+$scope.selectedNode.id).select(".label-node");
            delete $scope.selectedNode.editLabel;
            if (label.node()) {
                if (label.text() == $scope.selectedNode.label) return;
            }
            $http.post(getWebAppBackendUrl("set-label"),
            {"node_id": $scope.selectedNode.id,
            "label": $scope.selectedNode.label})
            .then(function() {
                $scope.isSaved = false;
                if (!$scope.selectedNode.label) {
                    label.remove();
                } else {
                    if (!label.node()) {
                        label =  d3.select("#node-" + $scope.selectedNode.id).append("text")
                                    .attr("class", "label-node")
                                    .attr("text-anchor","middle")
                                    .attr("x", side / 2)
                                    .attr("y", side + 15);
                    }
                    label.text($scope.selectedNode.label ? Format.ellipsis($scope.selectedNode.label, 30) : null);
                }
            }, function(e) {
                $scope.error.msg = e.data;
            });
        }

        $scope.resetLabel = function() {
            const label = d3.select("#node-"+$scope.selectedNode.id).select(".label-node");
            if (label.node()) {
                $scope.selectedNode.label = label.text();
            } else {
                delete $scope.selectedNode.label;
            }
            delete $scope.selectedNode.editLabel;
        }

        $scope.enableLabelEdit = function() {
            $scope.selectedNode.editLabel = true;
        }

        $scope.iconClick = function(list) {
            if ($scope.search.list == list) {
                delete $scope.search.list;
            } else {
               $scope.search.string = '';
               $scope.search.list = list;
            }
        }

        $scope.chooseFeature = function(feature) {
            $scope.search = {};
            $scope.selectedNode.featureChildren = feature;
            delete $scope.disableAddSplit;
            if (!$scope.histData[feature]) {
                $scope.loadingHistogram = true;
                $http.get(getWebAppBackendUrl("select-node/"+$scope.selectedNode.id+"/"+feature))
                .then(function(response) {
                    $scope.histData[feature] = response.data;
                    $scope.loadingHistogram = false;
                    $scope.createSplit($scope.treatedAsNum(feature));
                }, function(e) {
                    $scope.loadingHistogram = false;
                    $scope.error.msg = e.data;
                });
            } else {
                $scope.createSplit($scope.treatedAsNum(feature));
            }
        }

        $scope.createSplit = function(isNum) {
            if (isNum){
                $scope.selectedSplit = {"value": 0};
            } else {
                $scope.selectedSplit = {"value": new Set()};
                $scope.selectedSplit.usedValues = getUsedValues($scope.splits[$scope.selectedNode.id], true);
                $scope.selectedSplit.selectAll = false;
                $scope.disableAddSplit = true;
            }
        }

        $scope.selectSplit = function(split, isNum) {
            $scope.search = {};
            $scope.selectedSplit = split;
            if (!isNum) {
                $scope.selectedSplit.usedValues = getUsedValues($scope.splits[$scope.selectedNode.id]);
                $scope.selectedSplit.value = new Set($scope.treeData[split.left].values);
            } else {
                $scope.selectedSplit.value = $scope.treeData[split.left].end;
            }
        }

        function getUsedValues(splits, newSplit) {
            if (!splits || newSplit && !splits.length || !newSplit && splits.length <= 1) {
                return new Set();
            }
            let otherValues = [];
            splits.forEach(function(s) {
                if (s != $scope.selectedSplit) {
                    otherValues = otherValues.concat($scope.treeData[s.left].values);
                }
            });
            return new Set(otherValues);
        }

        $scope.styleRecord = function(value, split, isUsed) {
            if (split.value && split.value.has(value)) {
                return {'background': '#e6eef2'};
            }
            if (isUsed) {
                return {'background': '#eee', 'color': '#c1c1c1'};
            }
            return {'background': '#fff'};
        }

        $scope.valueNotChanged = function(childNode, newValue) {
            const oldValueCat = childNode.values;
            // numerical case
            if (!oldValueCat) {
                return newValue == childNode.end;
            }
            // categorical case
            if (newValue.size != oldValueCat.length) {
                return false;
            }

            for (let index in oldValueCat) {
                if (!newValue.has(oldValueCat[index])) {
                    return false;
                }
            }
            return true;
        }

        $scope.massSelect = function(filter, categories) {
            if (!filter) {
                filter = "";
            }
            let filteredCategories = categories.filter(function(elem) {
                return elem.value.toString().toLowerCase().includes(filter.toLowerCase())
                        && elem.value !== "No values"
                        && !$scope.selectedSplit.usedValues.has(elem.value);
            });
            if (filteredCategories.some(_ => !$scope.selectedSplit.value.has(_.value))) {
                filteredCategories.forEach(elem => $scope.selectedSplit.value.add(elem.value));
                $scope.disableAddSplit = false;
            } else {
                filteredCategories.forEach(elem => $scope.selectedSplit.value.delete(elem.value))
                $scope.disableAddSplit = true;
            }
            $scope.selectedSplit.selectAll = categories.length == $scope.selectedSplit.value.size;
        }

        $scope.changeCatValue = function(value, index, event) {
            if (event.shiftKey) {
                $scope.selectedSplit.value.add(value);
                let indexBefore = index - 1;
                let elemBefore = $scope.histData[$scope.selectedNode.featureChildren].bins[indexBefore];
                const before = new Set();
                while(elemBefore && !$scope.selectedSplit.value.has(elemBefore.value)) {
                    before.add(elemBefore.value);
                    indexBefore -= 1;
                    elemBefore = $scope.histData[$scope.selectedNode.featureChildren].bins[indexBefore];
                }
                if (indexBefore > -1) {
                    before.forEach($scope.selectedSplit.value.add, $scope.selectedSplit.value);
                }

                let indexAfter = index + 1;
                let elemAfter = $scope.histData[$scope.selectedNode.featureChildren].bins[indexAfter];
                const after = new Set();
                while(elemAfter && !$scope.selectedSplit.value.has(elemAfter.value)) {
                    after.add(elemAfter.value);
                    indexAfter += 1;
                    elemAfter = $scope.histData[$scope.selectedNode.featureChildren].bins[indexAfter];
                }
                if (indexAfter <  $scope.histData[$scope.selectedNode.featureChildren].bins.length) {
                    after.forEach($scope.selectedSplit.value.add, $scope.selectedSplit.value);
                }
                d3.select("#checkbox-" + index).property("checked", "checked");
            }
            else {
                if ($scope.selectedSplit.value.has(value)) {
                    $scope.selectedSplit.value.delete(value);
                } else {
                    $scope.selectedSplit.value.add(value);
                }
            }

            $scope.disableAddSplit = !$scope.selectedSplit.value.size;
            $scope.selectedSplit.selectAll = $scope.histData[$scope.selectedNode.featureChildren].bins.length == $scope.selectedSplit.value.size;
        }

        $scope.changeNumValue = function() {
            $scope.disableAddSplit = $scope.selectedSplit.value == undefined;
        }

        $scope.cancel = function() {
            delete $scope.selectedSplit;
            if (!$scope.splits[$scope.selectedNode.id]) {
                delete $scope.selectedNode.featureChildren;
            }
        }

        $scope.treatedAsNum = function(feature) {
            return feature in $scope.selectedNode.treated_as_numerical;
        }

        $scope.changeMeaning = function(becomesNum, feature) {
            if ($scope.treatedAsNum(feature) == becomesNum) {return;}
            $scope.loadingHistogram = true;
            if (becomesNum) {
                $scope.selectedNode.treated_as_numerical[feature] = null;
                $scope.disableAddSplit = false;
            } else {
                delete $scope.selectedNode.treated_as_numerical[feature];
            }
            $scope.createSplit(becomesNum);
            $http.post(getWebAppBackendUrl("change-meaning"),
                {"node_id": $scope.selectedNode.id,
                "feature": feature
                })
            .then(function(response) {
                $scope.histData[feature] = response.data;
                $scope.loadingHistogram = false;
            }, function(e) {
                $scope.error.msg = e.data;
                $scope.loadingHistogram = false;
            });
        }

        const checkSplitNode = function (parent, split) {
            let right = $scope.treeData[parent.children_ids[0]];
            if (!right) {
                return {};
            }
            let i = 0;
            while (right && right.end < split.value) {
                i += 1;
                right = $scope.treeData[parent.children_ids[i]];
            }
            return {
                    left_idx: right.end ? i - 1 : i,
                    right_idx: right.end ? i : -1
                }
        }

        $scope.autosplit = function(maxSplits) {
            if (maxSplits < 1 || !Number.isInteger(maxSplits)) {
                maxSplits = prompt("Confirming will automatically create some splits on the current node.\nMaximum number of splits wanted : ");
                if (maxSplits === null) {
                    return;
                }
                $scope.autosplit(parseFloat(maxSplits));
                return;
            }

            $scope.loadingTree = true;
            $http.post(getWebAppBackendUrl("/auto-split"),
                {nodeId: $scope.selectedNode.id, feature: $scope.selectedNode.featureChildren, maxSplits: maxSplits})
            .then(function(response) {
                delete $scope.selectedSplit;
                $scope.treeData = response.data;
                $scope.selectedNode.children_ids = $scope.treeData[$scope.selectedNode.id].children_ids;
                if (!$scope.selectedNode.children_ids.length) {
                    delete $scope.selectedNode.featureChildren;
                    alert("No split could be formed"); // cheesy but well
                    return;
                }
                $scope.isSaved = false;
                recreateSplits([$scope.selectedNode]);
                TreeInteractions.update($scope);
                TreeInteractions.shift($scope.selectedNode.id, $scope, "selected");

                if ($scope.selectedNode.isLeaf) {
                    $scope.selectedNode.isLeaf = false;
                    if ($scope.selectedNode.label) {
                        delete $scope.selectedNode.label;
                        $scope.editLabel();
                    }
                    let node = d3.select("#node-" + $scope.selectedNode.id);
                    node.select(".label-node").remove();
                    node.append("text")
                    .classed("feature-children", true)
                    .classed("selected", true)
                    .attr("text-anchor","middle")
                    .attr("x", side / 2)
                    .attr("y", side + 15)
                    .text(Format.ellipsis($scope.selectedNode.featureChildren, 20));
                }
                $scope.loadingTree = false;
            }, function(e) {
                $scope.loadingTree = false;
                $scope.error.msg = e.data;
            });
        }

        $scope.add = function(split, feature) {
            $scope.loadingTree = true;
            let nodeToBeSplit;
             if (!$scope.selectedNode.isLeaf && $scope.treatedAsNum(feature)) {
                const newSplitInfo = checkSplitNode($scope.selectedNode, split);
                // if new split splits another node (ie. value between the lower and upper bound of the node)
                if (newSplitInfo.left_idx > -1 && newSplitInfo.right_idx > -1) {
                    nodeToBeSplit = $scope.treeData[$scope.selectedNode.children_ids[newSplitInfo.right_idx]];
                    if (nodeToBeSplit.children_ids.length
                            && !confirm("Creating a split at " + split.value + " will affect downstream parts of your decision tree.\
                            \nBy confirming the addition of this split you will lose all branches below the node '"
                            + TreeInteractions.decisionRule(nodeToBeSplit, true) + "'")) {
                        return;
                    }
                }
            }
            delete $scope.selectedSplit;

            $http.post(getWebAppBackendUrl("add-split"), {
                parent_id: $scope.selectedNode.id,
                feature: feature,
                value: $scope.treatedAsNum(feature) ? split.value : Array.from(split.value),
            })
            .then(function(response) {
                $scope.loadingTree = false;
                $scope.isSaved = false;
                if ($scope.selectedNode.isLeaf) {
                    $scope.selectedNode.isLeaf = false;
                    if ($scope.selectedNode.label) {
                        delete $scope.selectedNode.label;
                        $scope.editLabel();
                    }
                    let node = d3.select("#node-" + $scope.selectedNode.id);
                    node.select(".label-node").remove();
                    node.append("text")
                    .classed("feature-children", true)
                    .classed("selected", true)
                    .attr("text-anchor","middle")
                    .attr("x", side / 2)
                    .attr("y", side + 15)
                    .text(Format.ellipsis(feature, 20));
                }

                const left = response.data.left, right = response.data.right, parent = response.data.parent;
                $scope.treeData[left.id] = left;
                $scope.treeData[right.id] = right;
                $scope.treeData[parent.id] = parent;
                $scope.selectedNode.children_ids = parent.children_ids;
                recreateSplits([$scope.selectedNode]);
                if (nodeToBeSplit) {
                    nodeToBeSplit = $scope.treeData[nodeToBeSplit.id];
                    d3.select("#node-" + nodeToBeSplit.id).select(".feature-children").remove();
                    delete $scope.splits[nodeToBeSplit.id];
                }
                TreeInteractions.update($scope);
                TreeInteractions.shift($scope.selectedNode.id, $scope, "selected");
            }, function(e) {
                $scope.loadingTree = false;
                $scope.error.msg = e.data;
            });
        }

        $scope.update = function(split, feature) {
            $scope.loadingTree = true;
            let nodeToBeSplit;
            let nodeToBeMoved;
            if ($scope.treatedAsNum(feature)) {
                const belowLowerBound = $scope.treeData[split.left].beginning && $scope.treeData[split.left].beginning > split.value;
                const aboveUpperBound = $scope.treeData[split.right].end && $scope.treeData[split.right].end < split.value;
                if (belowLowerBound || aboveUpperBound) {
                    const newSplitInfo = checkSplitNode($scope.selectedNode, split);
                    if (newSplitInfo.left_idx > -1 && newSplitInfo.right_idx > -1) {
                        nodeToBeSplit = $scope.treeData[$scope.selectedNode.children_ids[newSplitInfo.right_idx]];
                        nodeToBeMoved = belowLowerBound ? $scope.treeData[split.left] : $scope.treeData[split.right];
                        let askForConfirmation;
                        let msg = "\nBy confirming the modification of this split you will lose all branches below the node '";
                        if (nodeToBeSplit.children_ids.length) {
                            msg += TreeInteractions.decisionRule(nodeToBeSplit, true) + "'";
                            askForConfirmation = true;
                        }
                        if (nodeToBeMoved.children_ids.length) {
                            msg += (askForConfirmation ? " and the node '" : "") +  TreeInteractions.decisionRule(nodeToBeMoved, true) + "'";
                            askForConfirmation = true;
                        }
                        if (askForConfirmation && !confirm(msg)) {
                            return;
                        }
                    }
                }
            }
            delete $scope.selectedSplit;

            $http.post(getWebAppBackendUrl("update-split"), {
                "feature": feature,
                "left_id": split.left,
                "right_id": split.right,
                "value": $scope.treatedAsNum(feature) ? split.value : Array.from(split.value)
            })
            .then(function(response) {
                $scope.isSaved = false;
                $scope.loadingTree = false;
                $scope.treeData = response.data;
                $scope.selectedNode.children_ids = $scope.treeData[$scope.selectedNode.id].children_ids;
                recreateSplits([$scope.selectedNode]);
                if (nodeToBeSplit) {
                    nodeToBeSplit = $scope.treeData[nodeToBeSplit.id];
                    d3.select("#node-" + nodeToBeSplit.id).select(".feature-children").remove();
                    delete $scope.splits[nodeToBeSplit.id];
                }
                if (nodeToBeMoved) {
                    nodeToBeMoved = $scope.treeData[nodeToBeMoved.id];
                    d3.select("#node-" + nodeToBeMoved.id).select(".feature-children").remove();
                    delete $scope.splits[nodeToBeMoved.id];
                }
                TreeInteractions.update($scope);
                TreeInteractions.shift($scope.selectedNode.id, $scope, "selected");
            }, function(e) {
                $scope.loadingTree = false;
                $scope.error.msg = e.data;
            });
        }

        $scope.submit = function(split, feature) {
            if (split.left) {
                $scope.update(split, feature);
            } else {
                $scope.add(split, feature);
            }
        }

        $scope.confirmDelete = function(split, splits, feature) {
            let msg = "By confirming the deletion of this split you will delete ";
            if (splits.length > 1) {
                msg += "the node '" + TreeInteractions.decisionRule($scope.treeData[split.left], true) + "' and lose all the branches below";
            } else {
                msg += "the nodes '"
                        + TreeInteractions.decisionRule($scope.treeData[split.left], true) + "' and '"
                        + TreeInteractions.decisionRule($scope.treeData[split.right], true) +  "' and lose all the branches below them";
            }
            if (confirm(msg)) {
                del(split, feature);
            }
        }

        $scope.confirmDeleteAll = function() {
            if (confirm("By confirming the deletion of all the splits at the selected node, you will lose all the branches below it")) {
                deleteAllSplits();
            }
        }

        function del(split, feature) {
            delete $scope.selectedSplit;
            $scope.loadingTree = true;
            $http.delete(getWebAppBackendUrl("delete-split"),
                {"data": {"feature": feature,
                            "left_id": split.left,
                            "right_id": split.right,
                            "parent_id": $scope.selectedNode.id}})
            .then(function(response) {
                $scope.loadingTree = false;
                $scope.isSaved = false;

                $scope.treeData = response.data["nodes"];
                $scope.selectedNode.children_ids =  $scope.treeData[$scope.selectedNode.id].children_ids;
                TreeInteractions.update($scope);
                TreeInteractions.shift($scope.selectedNode.id, $scope, "selected");
                if ($scope.splits[$scope.selectedNode.id].length == 1) {
                    $scope.selectedNode.isLeaf = true;
                    delete $scope.splits[$scope.selectedNode.id];
                    d3.select("#node-" + $scope.selectedNode.id).select(".feature-children").remove();
                    delete $scope.selectedNode.featureChildren;
                } else {
                    recreateSplits([$scope.selectedNode]);
                }
            }, function(e) {
                $scope.loadingTree = false;
                $scope.error.msg = e.data;
            });
        }

        function deleteAllSplits() {
            $scope.loadingTree = true;
            $http.delete(getWebAppBackendUrl("delete-all-splits"),
                {"data": {"parent_id": $scope.selectedNode.id}})
            .then(function(response) {
                $scope.loadingTree = false;
                $scope.isSaved = false;
                delete $scope.splits[$scope.selectedNode.id];
                delete $scope.selectedNode.featureChildren;
                $scope.selectedNode.children_ids = [];
                $scope.selectedNode.isLeaf = true;
                d3.select("#node-" + $scope.selectedNode.id).select(".feature-children").remove();

                $scope.treeData = response.data;
                TreeInteractions.update($scope);
                TreeInteractions.shift($scope.selectedNode.id, $scope, "selected");
            }, function(e) {
                $scope.loadingTree = false;
                $scope.error.msg = e.data;
            });
        }

        if ($scope.config.newTree) {
            $scope.create($scope.config.dataset, $scope.config.target, $scope.config.sampleSize, $scope.config.sampleMethod);
        } else {
            $scope.load($scope.config.file, $scope.config.sampleSize, $scope.config.sampleMethod);
        }
    });
})();
