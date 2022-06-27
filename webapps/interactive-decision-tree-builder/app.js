(function() {
    'use strict';

    app.controller("IdtbController", function($scope, ModalService) {
        dataiku.checkWebAppParameters();
        $scope.template = "create";
        $scope.setTemplate = function(newTemplate) {
            $scope.template = newTemplate;
        }
        $scope.config = {};
        $scope.modal = {};
        $scope.removeModal = function(event) {
            if (ModalService.remove($scope.modal)(event)) {
                angular.element(".template").focus();
            }
        };
        $scope.createModal = ModalService.create($scope.modal);
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
                        $scope.createModal.error(e.data);
                    });
                }
            }
        });

        $scope.$watch("config.sampleMethod", function(nv, ov) {
            if(nv) {
                if (!ov && !$scope.config.hasOwnProperty("sampleSize")) {
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
            $scope.createModal.error(e.data);
        });

        const featuresPerDataset = {};
        $scope.$watch("config.dataset", function(nv) {
            if (nv) {
                if (!featuresPerDataset[nv]) {
                    $http.get(getWebAppBackendUrl("get-features/"+$scope.config.dataset))
                    .then(function(response) {
                        $scope.features = response.data.features;
                        featuresPerDataset[nv] = response.data.features;
                    }, function(e) {
                        delete $scope.features;
                        $scope.createModal.error(e.data);
                    });
                } else {
                    $scope.features = featuresPerDataset[nv];
                }
            } else {
                delete $scope.config.target;
            }
        });

        const fileConfig = {};
        $scope.$watch("config.file", function(nv) {
            if (nv) {
                if (!fileConfig[nv]) {
                    $http.get(getWebAppBackendUrl("get-config/"+encodeURIComponent(nv)))
                    .then(function(response) {
                        fileConfig[nv] = response.data;
                        if (!fileConfig[nv].sampleSize) {
                            delete fileConfig[nv].sampleMethod;
                        }
                        $scope.config.sampleMethod = fileConfig[nv].sampleMethod;
                        $scope.config.sampleSize = fileConfig[nv].sampleSize;
                        $scope.config.target = fileConfig[nv].target;
                    }, function(e) {
                        delete $scope.target;
                        $scope.createModal.error(e.data);
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

        $scope.displaySamplingMethod = function(method) {
            if (!method) return 'Full';
            return method[0].toUpperCase() + method.slice(1)
        };
    });

    app.controller("WebappTreeEditController", function($scope, $http, $timeout, $controller, TreeInteractions, SunburstInteractions) {
        $controller("_TreeEditController", {$scope});

        $scope.close = function(force) {
            if (!$scope.isSaved && !force) {
                $scope.createModal.confirm("Are you sure you want to exit without saving? All unsaved changes will be lost.",
                                            "Exit without saving",
                                            () => $scope.close(true))
                return;
            }
            delete $scope.config.file;
            delete $scope.config.dataset;
            $scope.setTemplate('create');
        };

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
            $scope.splits = {};
            $scope.setScale("Pastel");
            TreeInteractions.createTree($scope);
            $scope.loadingTree = false;
        }

        function create(name, target, size, method) {
            $scope.loadingTree = true;
            $http.post(getWebAppBackendUrl("create"),
                {"name": name, "target": target, "sample_size": size, "sample_method": method})
            .then(function(response) {
                initTree(response.data);
            }, function(e) {
                $scope.loadingTree = false;
                $scope.createModal.error(e.data);
            });
        }

        function load(filename, size, method) {
            $scope.loadingTree = true;
            $scope.isSaved = true;
            $http.post(getWebAppBackendUrl("load"), {"filename": filename, "sample_size": size, "sample_method": method})
            .then(function(response) {
                $scope.config.file = $scope.config.file.split(".json")[0].substring(1);
                initTree(response.data);
                $scope.recreateSplits(Object.values(response.data.nodes));
            }, function(e) {
                $scope.loadingTree = false;
                $scope.createModal.error(e.data);
            });
        }

        if ($scope.config.newTree) {
            create($scope.config.dataset, $scope.config.target, $scope.config.sampleSize, $scope.config.sampleMethod);
        } else {
            load($scope.config.file, $scope.config.sampleSize, $scope.config.sampleMethod);
        }
    });
})();
