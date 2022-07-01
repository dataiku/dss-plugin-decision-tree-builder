(function() {
    'use strict';

    app.controller("IdtbController", function($scope) {
        dataiku.checkWebAppParameters();
        $scope.template = "edit";
        $scope.setTemplate = function(newTemplate) {
            $scope.template = newTemplate;
        }
        $scope.config = {};
    });

    app.controller("WebappTreeEditController", function($scope, $http, $controller, $timeout,
        TreeInteractions, SunburstInteractions, ModalService) {
        $controller("_TreeEditController", {$scope});

        $scope.$watch("template", function(nv, ov) {
            if (ov == nv) return;
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
                        TreeInteractions.select(0, $scope, true);
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
                        TreeInteractions.select(0, $scope, true);
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

        const initTree = function(data) {
            $scope.treeData = data.nodes;
            $scope.features = data.features;
            $scope.targetValues = data.target_values;
            $scope.config = { target: data.target }; // TODO: clean up
            $scope.splits = {};
            $scope.setScale("Pastel");
            TreeInteractions.createTree($scope);
            $scope.loadingTree = false;
        }

        $scope.loadingTree = true;
        $http.get(getWebAppBackendUrl("load"))
            .then(function(response) {
                initTree(response.data);
                $scope.recreateSplits(Object.values(response.data.nodes));
            }, function(e) {
                $scope.loadingTree = false;
                ModalService.createBackendErrorModal($scope, e.data);
            });
    });
})();
