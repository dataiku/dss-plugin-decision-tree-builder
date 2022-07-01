'use strict';
app.service("Format", function() {
    return {
        ellipsis: function(text, length) {
            text = text.toString();
            if (text.length > length) {
                return (text.substr(0, length-3) + "...");
            }
            return text;
        },
        toFixedIfNeeded: function(number, decimals) {
            if(Math.round(number) !== number) {
                return number.toFixed(decimals);
            }
            return number;
        }
    };
});

app.directive('dkuIndeterminate', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attributes) {
            scope.$watch(attributes.dkuIndeterminate, function(value) {
                element.prop('indeterminate', !!value);
            });
        }
    };
});

app.directive("spinner", function () {
    return {
        template: "<div class='spinner-container'></div>",
        link: function (scope, element) {
            var opts = {
                lines: 6,
                length: 0,
                width: 10,
                radius: 10,
                corners: 1,
                rotate: 0,
                color: '#fff',
                speed: 2,
                trail: 60,
                shadow: false,
                hwaccel: false,
                className: 'spinner',
                zIndex: 2e9,
                top: '10px',
                left: '10px'
             };
             const spinner = new Spinner(opts);
             spinner.spin(element[0].childNodes[0]);
        }
    }
});

app.service("ModalService", function($compile, $http) {
    const DEFAULT_MODAL_TEMPLATE = "/plugins/decision-tree-builder/resource/templates/modal.html";

    function create(scope, config, templateUrl=DEFAULT_MODAL_TEMPLATE) {
        $http.get(templateUrl).then(function(response) {
            const template = response.data;
            const newScope = scope.$new();
            const element = $compile(template)(newScope);

            angular.extend(newScope, config);

            newScope.close = function(event) {
                if (event && !event.target.className.includes("modal-background")) return;
                element.remove();
            };

            if (newScope.promptConfig && newScope.promptConfig.conditions) {
                const inputField = element.find("input");
                for (const attr in newScope.promptConfig.conditions) {
                    inputField.attr(attr, newScope.promptConfig.conditions[attr]);
                }
                $compile(inputField)(newScope);
            }

            angular.element("body").append(element);
        });
    };
    return {
        createBackendErrorModal: function(scope, errorMsg) {
            create(scope, {
                title: 'Backend error',
                msgConfig: { error: true, msg: errorMsg }
            }, DEFAULT_MODAL_TEMPLATE);
        },
        create
    };
});

app.directive('tooltip', function() {
    return {
        scope: true,
        templateUrl: "/plugins/decision-tree-builder/resource/templates/tooltip.html",
        link: function($scope, element, attr) {
            if(attr.tooltip == "tree") {
                const node = $scope.treeData[attr.node];
                $scope.probabilities = node.probabilities;
                $scope.samples = node.samples;

                d3.select(element[0].children[0])
                .attr("x", -30)
                .attr("y", -25)
                .attr("height", 80)
                .attr("width", 240)
                .select(".tooltip-info")
                .classed("tooltip-info-tree", true);

                // Compute the position of each group on the pie
                var pie = d3.layout.pie()
                    .value(function(d) {return d[1];});
                var proba = pie($scope.probabilities);

                // Build the pie chart
                d3.select("#tooltip-" + node.id)
                .append("g")
                .attr("transform", "translate(5, 10)")
                .selectAll('.camembert')
                .data(proba)
                .enter()
                .append('path')
                .attr('d', d3.svg.arc()
                    .innerRadius(0)
                    .outerRadius(30)
                )
                .attr('fill', function(d) {
                    return $scope.colors[d.data[0]];
                });
            }

            if (attr.tooltip == "histogram") {
                const histData = $scope.histData[attr.feature].bins[attr.binIndex];
                $scope.probabilities = Object.entries(histData.target_distrib);
                $scope.probabilities.sort(function(a, b) {
                    return b[1] - a[1];
                });
                $scope.probabilities = $scope.probabilities.slice(0, 5).map(_ => [_[0], _[1] / histData.count]);
                $scope.samples = [histData.count, 100*histData.count / $scope.selectedNode.samples[0]];
                $scope.binName = histData.value;

                d3.select(element[0].children[0])
                .attr("width", 190)
                .attr("height", 60 + $scope.probabilities.length * 22);
            }
        }
    };
});

app.directive('focusHere', function ($timeout) {
    return {
        restrict: 'A',
        link: function (scope, element) {
            $timeout(function() {
                element[0].focus();
            });
        }
    };
});

app.directive("customDropdown", function() {
    return {
        scope: {
            form: '=?',
            itemImage: '=?',
            label: '@',
            itemName: '@',
            item: '=',
            items: '=',
            possibleValues: '=',
            notAvailableValues: '=',
            onChange: '=',
            display: '=?',
            containerClass: '@'
        },
        restrict: 'A',
        templateUrl:'/plugins/decision-tree-builder/resource/templates/custom-dropdown.html',
        link: function(scope, elem, attrs) {
            const VALIDITY = "dropdown-not-empty" + (attrs.id ? ("__" + attrs.id) : "");
            function setValidity() {
                if (!scope.form) return;
                scope.form.$setValidity(VALIDITY, !!scope.item || !!(scope.items || {}).size);
            }
            setValidity();

            scope.display = scope.display || (item => item === "__dku_missing_value__" ? "" : item);

            scope.canBeSelected = function(item) {
                if (!scope.notAvailableValues) return true;
                return item === scope.item || !(item in scope.notAvailableValues);
            };

            const isMulti = !!attrs.items;
            if (!isMulti && !scope.item) {
                scope.item = null;
            }

            scope.isSelected = function(value) {
                if (isMulti) {
                    return scope.items.has(value);
                }
                return scope.item === value;
            };

            scope.updateSelection = function(value, event) {
                if (isMulti) {
                    if (scope.isSelected(value)) {
                        scope.items.delete(value);
                    } else {
                        scope.items.add(value);
                    }
                    event.stopPropagation();
                } else {
                    if (scope.item === value) return;
                    if (scope.onChange) {
                        scope.onChange(value, scope.item, elem);
                    }
                    scope.item = value;
                }
                setValidity();
            };

            scope.getPlaceholder = function() {
                if (isMulti) {
                    if (!(scope.items || {}).size) return "Select " + scope.itemName + "s";
                    return scope.items.size + " " + scope.itemName + (scope.items.size > 1 ? "s" : "");
                }
                if (scope.item === null) return "Select a " + scope.itemName;
                return scope.display(scope.item);
            };

            scope.toggleDropdown = function() {
                scope.isOpen = !scope.isOpen;
            };

            const dropdownElem = elem.find(".custom-dropdown");
            const labelElem = elem.find(".label-text");
            scope.$on("closeDropdowns", function(e, target) {
                if ((target) && ( angular.element(target).closest(dropdownElem)[0]
                    || angular.element(target).closest(labelElem)[0] )) { return; }
                scope.isOpen = false;
            });

            scope.$on("$destroy", function() {
                scope.form && scope.form.$setValidity(VALIDITY, true);
            });
        }
    }
});
