(function() {
    'use strict';

    app.controller("IdtbController", function($scope) {
        dataiku.checkWebAppParameters();
        $scope.template = "create";
        $scope.setTemplate = function(newTemplate) {
            $scope.template = newTemplate;
        }
        $scope.config = {};

        $scope.$on("closeModal", function() {
            angular.element("#webapp-main").focus();
        });
    });

    app.controller("CreateOrLoadController", function($scope, $http, ModalService) {
        $scope.forms = {};
        $scope.onTreeSourceChange = function(newTree) {
            $scope.config.newTree = newTree;
            delete $scope.config.file;
            delete $scope.config.target;
            delete $scope.config.dataset;
            delete $scope.features;

            if (newTree) {
                $scope.config.sampleMethod = "head";
                $scope.config.sampleSize = 10000;
            } else {
                if (!$scope.files) {
                    $scope.loadingLandingPage = true;
                    $http.get(getWebAppBackendUrl("get-files"))
                    .then(function(response) {
                        $scope.loadingLandingPage = false;
                        $scope.files = response.data.files;
                    }, function(e) {
                        $scope.loadingLandingPage = false;
                        ModalService.createBackendErrorModal($scope, e.data);
                    });
                }
            }
        };
        $scope.onTreeSourceChange(true)

        $scope.onSampleMethodChange = function(nv, ov) {
            if (nv === 'full') {
                delete $scope.config.sampleSize;
                return;
            }

            if (ov === 'full' && $scope.configsampleSize == null) {
                $scope.config.sampleSize = 10000;
            }
        };

        $scope.loadingLandingPage = true;
        $http.get(getWebAppBackendUrl("get-datasets"))
        .then(function(response) {
            $scope.loadingLandingPage = false;
            $scope.datasets = response.data.datasets;
        }, function(e) {
            $scope.loadingLandingPage = false;
            ModalService.createBackendErrorModal($scope, e.data);
        });

        const featuresPerDataset = {};
        $scope.onDatasetChange = function(nv) {
            delete $scope.config.target;
            if (!featuresPerDataset[nv]) {
                $scope.loadingLandingPage = true;
                const encodedDataset = encodeURIComponent(encodeURIComponent(nv));
                $http.get(getWebAppBackendUrl(`get-features/${encodedDataset}`))
                .then(function(response) {
                    $scope.loadingLandingPage = false;
                    $scope.features = response.data.features;
                    featuresPerDataset[nv] = response.data.features;
                }, function(e) {
                    delete $scope.features;
                    $scope.loadingLandingPage = false;
                    ModalService.createBackendErrorModal($scope, e.data);
                });
            } else {
                $scope.features = featuresPerDataset[nv];
            }
        };

        const fileConfig = {};
        $scope.onFileChange = function(nv) {
            if (!nv) return;

            if (!fileConfig[nv]) {
                $scope.loadingLandingPage = true;
                $http.get(getWebAppBackendUrl("get-config/" + nv))
                .then(function(response) {
                    $scope.loadingLandingPage = false;

                    fileConfig[nv] = response.data;
                    $scope.config.sampleMethod = fileConfig[nv].sampleMethod;
                    $scope.config.sampleSize = fileConfig[nv].sampleSize;
                    $scope.config.target = fileConfig[nv].target;
                    $scope.config.dataset = fileConfig[nv].dataset;
                }, function(e) {
                    $scope.loadingLandingPage = false;
                    delete $scope.target;
                    ModalService.createBackendErrorModal($scope, e.data);
                });
            } else {
                $scope.config.sampleMethod = fileConfig[nv].sampleMethod;
                $scope.config.sampleSize = fileConfig[nv].sampleSize;
                $scope.config.target = fileConfig[nv].target;
                $scope.config.dataset = fileConfig[nv].dataset;
            }
        };

        $scope.edit = function() {
            $scope.setTemplate('edit');
        }

        $scope.displaySamplingMethod = function(method) {
            return method[0].toUpperCase() + method.slice(1)
        };
    });

    app.controller("WebappTreeEditController", function($scope, $http, $timeout, $controller,
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
                ModalService.createBackendErrorModal($scope, e.data);
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
                ModalService.createBackendErrorModal($scope, e.data);
            });
        }

        if ($scope.config.newTree) {
            create($scope.config.dataset, $scope.config.target, $scope.config.sampleSize, $scope.config.sampleMethod);
        } else {
            load($scope.config.file, $scope.config.sampleSize, $scope.config.sampleMethod);
        }
    });
})();
