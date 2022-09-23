'use strict';
app.service("TreeInteractions", function($http, $timeout, $compile, ModalService, Format) {
    let svg, tree, currentPath = new Set();
    const side = 30, maxZoom = 3;

    const zoom = function() {
        svg.attr("transform",  "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")")
    };

    const zoomListener = d3.behavior.zoom()
        .on("zoom", function() {
            const svgArea = svg.node().getBoundingClientRect().width * svg.node().getBoundingClientRect().height;
            zoomListener.scaleExtent([svgArea < 100 ? zoomListener.scale() :  0, maxZoom])
            zoom();
    });

    const nodeValues = function(d) {
        if (d.values) {
            if (d.others) {
                return "Others"
            }
            return Format.ellipsis(d.values.join(", "), 20);
        }
        return ((d.hasOwnProperty("beginning") ? ("[" + Format.ellipsis(d.beginning, 8)) : "]-∞") + " ; "
                + (d.hasOwnProperty("end") ? (Format.ellipsis(d.end, 8) + "[") : "+∞["));
    }

    const decisionRule = function(node, ellipsis) {
        if (node.values) {
            let middle = " is ";
            if (node.others) {
                middle += "not ";
            }
            if (node.values.length > 1) {
                middle += "one of ";
            }
            if (ellipsis) {
                return Format.ellipsis(node.feature, 20) + middle + Format.ellipsis(node.values, 20);
            }
            return node.feature + middle + node.values;
        }
        if (ellipsis) {
            return (node.hasOwnProperty("beginning") ? (Format.ellipsis(node.beginning, 10) + " ≤ ") : "")
                + Format.ellipsis(node.feature, 20)
                + (node.hasOwnProperty("end") ? (" < " + Format.ellipsis(node.end, 10)) : "");
        }
        return (node.hasOwnProperty("beginning") ? (node.beginning + " ≤ ") : "")
        + node.feature
        + (node.hasOwnProperty("end") ? (" < " + node.end) : "");
    }

    const shift = function(id, scope, classLink, unspread) {
        let nodes = Array.from(scope.treeData[0].children_ids);
        const shiftRight = new Set();
        while (nodes.length) {
            const node = scope.treeData[nodes.shift()];
            if (node.parent_id != id) {
                nodes = nodes.concat(node.children_ids);
            }

            const linkParentToNode = d3.select("#link-" + node.id);
            if (linkParentToNode.classed(classLink)) {
                shiftRight.add(node.parent_id);
            } else {
                if (node.parent_id != id) {
                    let delta;
                    if (shiftRight.has(node.parent_id)) {
                        delta = 120 + 40*node.depth;
                        shiftRight.add(node.id);
                    } else {
                        delta = -80 - 30*node.depth;
                    }
                    node.x = node.x + (unspread ? -delta : delta);
                    d3.select("#node-" + node.id).attr("transform", function(d) {
                        return "translate(" + d.x + "," + d.y + ")";
                    });
                }
                linkParentToNode.attr("d", function(d) {
                    return d3.svg.diagonal()({source: {x: d.source.x + side/2, y: d.source.y},
                        target: {x: d.target.x + side/2, y: d.target.y}});
                });
            }
        }
    }

    const hideUnselected = function(id) {
        d3.selectAll("[tooltip]").classed("selected", false);
        d3.selectAll(".selected").classed("selected", false);
        d3.select("#node-" + id).select("rect").style("stroke", null).style("stroke-width", null);
    }

    const showSelected = function(id, scope) {
        let node_id = id;
        currentPath.clear();
        scope.decisionRule = [];
        while (node_id > -1) {
            let node = d3.select("#node-" + node_id);
            node.selectAll(".decision-rule,.feature-children,[tooltip]").classed("selected", true).classed("hovered", false);
            d3.select("#link-" + node_id).classed("selected", true).classed("hovered", false);

            if (node_id == id) {
                node.select("rect").style("stroke", "#007eff")
                    .style("stroke-width", "1px");
            }

            if (scope.template == "viz") {
                node.select("#tooltip-"+node_id).classed("selected", true);
            }

            if (node_id > 0) {
                scope.decisionRule.unshift({"full": decisionRule(node.node().__data__), "ellipsed": decisionRule(node.node().__data__, true)});
            }
            currentPath.add(node_id);
            node_id = node.node().__data__.parent_id;
        }
    }

    const showHovered = function(id, scope) {
        let node_id = id;
        while (node_id > -1) {
            let node = d3.select("#node-" + node_id);
            node.selectAll(".decision-rule,.feature-children").classed("hovered", true);
            d3.select("#link-" + node_id).classed("hovered", true);
            if (scope.template == "viz") {
                node.select("#tooltip-"+node_id).classed("hovered", true);
            }
            node_id = scope.treeData[node_id].parent_id;
        }
    }

    const hideUnhovered = function() {
        d3.selectAll(".hovered").classed("hovered", false);
    }

    const zoomBack = function(selectedNode) {
        centerOnNode(selectedNode, true);
    }

    const zoomFit = function(vizMode) {
        const treePanel = d3.select(".tree").node().getBoundingClientRect(),
            svgDim = svg.node().getBBox();
        const leftOffset = 10;
        const scaleX = treePanel.width / (svgDim.width + leftOffset),
            scaleY = treePanel.height / (svgDim.height + (vizMode ? 5 : 25))
        const scale = Math.min(scaleX, scaleY, maxZoom);

        let leftTranslate;
        if (scale == maxZoom) {
            leftTranslate = treePanel.width / 2;
        } else {
            leftTranslate = (Math.abs(svgDim.x) + leftOffset)*scale;
        }

        const topTranslate = (vizMode ? 40 : 20) * scale;
        zoomListener.translate([leftTranslate, topTranslate]).scale(scale);
        svg.transition().duration(400).attr("transform", "translate(" + leftTranslate + "," + topTranslate +")scale(" + scale + ")");
    }

    const centerOnNode = function(selectedNode, unzoom) {
        const scale = unzoom ? 1 : zoomListener.scale(),
            treePanel = d3.select(".tree").node().getBoundingClientRect();

        const x = treePanel.width / 2 - selectedNode.x * scale,
            y = treePanel.height / 2 - selectedNode.y * scale;

        svg.transition()
            .duration(400)
            .attr("transform", "translate(" + x + "," + (y - 20) + ")scale(" + scale + ")");
        zoomListener.translate([x, y]).scale(scale);
    }

    const select = function(id, scope, unzoom, noRecenter) {
        if(scope.selectedNode) {
            delete scope.selectedNode.editLabel;
        }
        if (scope.selectedNode) {
            update(scope);
            hideUnselected(scope.selectedNode.id);
        }
        showSelected(id, scope);
        shift(id, scope, "selected");
        scope.selectedNode = scope.treeData[id];
        delete scope.selectedSplit;
        scope.histData = {};
        const firstChild = scope.selectedNode.children_ids[0];
        if (firstChild) {
            if (scope.template == "edit") {
                scope.loadingHistogram = true;
                $http.get(getWebAppBackendUrl("select-node/"+id+"/"+scope.treeData[firstChild].feature))
                .then(function(response) {
                    scope.histData[scope.treeData[firstChild].feature] = response.data;
                    scope.selectedNode.featureChildren = scope.treeData[firstChild].feature;
                    scope.loadingHistogram = false;
                }, function(e) {
                    scope.loadingHistogram = false;
                    ModalService.createBackendErrorModal(scope, e.data);
                });
            }
        } else {
            scope.selectedNode.isLeaf = true;
            delete scope.selectedNode.featureChildren;
        }

        if (!noRecenter) {
            centerOnNode(scope.selectedNode, unzoom);
        }
    }

    const addVizTooltips = function(scope) {
        d3.selectAll(".node").append("g")
        .attr("transform", "translate(100, -10)")
        .attr("tooltip", "tree")
        .attr("id", d => "tooltip-" + d.id)
        .attr("node", d => d.id)
        .call(function() {
            $compile(this[0])(scope);
        })
        .on("wheel", function() {
            d3.event.stopPropagation();
        });

        showSelected(scope.selectedNode.id, scope);
    };

    const createTree = function(scope) {
        tree = d3.layout.tree()
                .nodeSize([140, 65])
                .children(function(d) {
                   return d.children_ids.map(_ => scope.treeData[_]);
               });

        svg = d3.select(".tree").append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .call(zoomListener).on("dblclick.zoom", null)
            .append("g");

        update(scope);
        select(0, scope, true);
    }

    const update = function(scope) {
        let source = scope.treeData[0];
        var nodes = tree.nodes(source).reverse(),
          links = tree.links(nodes);

        nodes.forEach(function(d) {
          d.y = d.depth * 180;
        });

        var node = svg.selectAll("g.node")
        .data(nodes, d => d.id);

        // update pre-existing nodes
        node.attr("transform", function(d) {
             return "translate(" + d.x + "," + d.y + ")";
        });

        node.select("rect")
        .style("fill", function(d) {return scope.colors[d.prediction] || "black"});

        node.select(".decision-rule")
        .text(d => nodeValues(d));

        // delete old nodes
        node.exit().remove();

        // add new nodes
        var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("id", d => "node-" + d.id)
        .attr("transform", function(d) {
            return "translate(" + d.x + "," + d.y + ")";
        });

        nodeEnter.append("rect")
        .attr("height", side)
        .attr("width", side)
        .style("fill", function(d) {return scope.colors[d.prediction] || "black"})
        .on("click", function(d) {
            if (scope.selectedNode && scope.selectedNode.id == d.id) {return;}
            $timeout(select(d.id, scope));
        })
        .on("mouseenter", function(d) {
            if (currentPath.has(d.id)) { return;}
            showHovered(d.id, scope);
            shift(d.id, scope, "hovered");
        })
        .on("mouseleave", function(d) {
            if (currentPath.has(d.id)) { return;}
            shift(d.id, scope, "hovered", true);
            hideUnhovered();
        });

        nodeEnter.filter(d => d.id > 0)
        .append("text")
        .attr("class", "decision-rule")
        .attr("text-anchor","middle")
        .attr("x", side / 2)
        .attr("y", - 5)
        .text(d => nodeValues(d));

        nodeEnter.filter(d => d.children_ids.length)
        .append("text")
        .attr("class", "feature-children")
        .attr("text-anchor","middle")
        .attr("x", side / 2)
        .attr("y", side + 15)
        .text(d => Format.ellipsis(scope.treeData[d.children_ids[0]].feature, 20));

        nodeEnter.filter(d => d.label)
        .append("text")
        .attr("class", "label-node")
        .attr("text-anchor","middle")
        .attr("x", side / 2)
        .attr("y", side + 15)
        .text(d => Format.ellipsis(d.label, 30));

        var link = svg.selectAll(".link")
        .data(links, d => d.target.id);

        // update pre-existing links
        link.attr("d", function(d) {
            return d3.svg.diagonal()({source: {x: d.source.x + side/2, y: d.source.y},
                                    target: {x: d.target.x + side/2, y: d.target.y}});
        })
        .attr("stroke", function(d) {return scope.colors[d.target.prediction] || "black"})
        .attr("stroke-width", function(d) {
                return 1+d.target.samples[1] / 5;
        });

        // delete old links
        link.exit().remove();

        // add new links
        link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("id", d => "link-" + d.target.id)
        .attr("d", function(d) {
            return d3.svg.diagonal()({source: {x: d.source.x + side/2, y: d.source.y},
                                  target: {x: d.target.x + side/2, y: d.target.y}});
        })
        .attr("stroke", function(d) {return scope.colors[d.target.prediction] || "black"})
        .style("fill", "none")
        .attr("stroke-width", function(d) {
                return 1+d.target.samples[1] / 5;
        })
        .attr("stroke-opacity", ".8");
    }

    const updateTooltipColors = function(colors) {
        d3.selectAll("[tooltip]").selectAll("path").attr("fill", d => colors[d.data[0]]);
    }

    return {
        createTree: createTree,
        decisionRule: decisionRule,
        zoomFit: zoomFit,
        zoomBack: zoomBack,
        addVizTooltips: addVizTooltips,
        select: select,
        updateTooltipColors: updateTooltipColors
    }
});

app.service("SunburstInteractions", function(Format, TreeInteractions) {
    // Breadcrumb dimensions: width, height, spacing, width of tip/tail.
    const b = {
        w: 590, h: 20, s: 3, t: 10
    };

    const initializeBreadcrumbTrail = function() {
        const trail = d3.select("#leftsidebar").append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("id", "trail");

        // Add the label at the end, for the percentage.
        trail.append("text").attr("id", "endlabel").style("fill", "#000");
    }

    const breadcrumbPoints = function(id) {
        let points = "0,0 ";
        points += b.w + ",0 ";
        points += b.w + b.t + "," + (b.h / 2) + " ";
        points += b.w + "," + b.h + " ";
        points += "0," + b.h + " ";
        if (id > 0) {
            points += b.t + "," + (b.h / 2);
        }
    return points;
    }

    let currentScale;
    const createSun = function(treeData, colors) {
        currentScale = colors;
        const vis = d3.select("#chart")
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .append("g")
        .attr("id", "container");

        const sunburstW = d3.select("#chart").node().getBoundingClientRect().width,
            sunburstH = d3.select("#chart").node().getBoundingClientRect().height;
        vis.attr("transform", "translate(" + sunburstW / 2 + "," + sunburstH / 2 + ")");

        const partition = d3.layout.partition()
            .sort(function(a,b) {
                return b.parent.children_ids.indexOf(b) - a.parent.children_ids.indexOf(a);
            })
            .size([2 * Math.PI, 100])
            .value(function(d) { return d.samples[0]; })
            .children(function(d) {
                return d.children_ids.map(_ => treeData[_]);
            });

        const radius = (Math.min(sunburstH, sunburstW) - 10) / 2;
        const arc = d3.svg.arc()
            .startAngle(function(d) { return d.x; })
            .endAngle(function(d) { return d.x + d.dx; })
            .innerRadius(function(d) { return radius * Math.sqrt(d.y) / 10; })
            .outerRadius(function(d) { return radius * Math.sqrt(d.y + d.dy) / 10; });

        // Basic setup of page elements.
        initializeBreadcrumbTrail();
        // Bounding circle underneath the sunburst
        vis.append("circle").attr("r", radius).style("opacity", 0);

        // For efficiency, filter nodes to keep only those large enough to see.
        const fakeRoot = Object.assign({}, treeData[0]);
        fakeRoot.children_ids = [0];
        const nodes = partition.nodes(fakeRoot)
            .filter(function(d) {
                return (d.dx > 0.005); // 0.005 radians = 0.29 degrees
            });
        delete fakeRoot.parent;

        const mouseenter = function(d) {
            d3.select("#percentage").remove();
            let percentageString;
            if (d.samples[1] < 0.1) {
                percentageString = "< 0.1%";
            } else {
                percentageString = Format.toFixedIfNeeded(d.samples[1], 2) + "%";
            }

            const rootText = d3.select("#root")
            .append("text")
            .attr("id", "percentage")
            .text(percentageString);

            const x = - rootText.node().getBoundingClientRect().width / 2;
            rootText.attr("x", x);

            // Fade all the segments.
            d3.selectAll("path").style("opacity", d => d.depth ? 0.3 : 0);
            updateBreadcrumbs(d, d.samples[0] + " samples", currentScale);
        }

        const mouseleave = function(d) {
            d3.select("#percentage").remove();
            d3.select("#trail").selectAll("g").remove();
            d3.select("#endlabel").style("display", "none");
            d3.selectAll("path")
            .style("opacity", d => d.depth ? null : 0);
        }

        const drawArcs = function(p) {
            d3.select("#unzoom-msg").remove();
            const fakeRoot = Object.assign({}, treeData[p.parent_id]);
            fakeRoot.children_ids = [p.id];
            const nodes = partition.nodes(fakeRoot)
                .filter(function(d) {
                    return (d.dx > 0.005);
                });

            const data =  vis.selectAll("g").data(nodes);
            data.exit().remove();

            data.attr("id", d => d.depth ? ("arc-sun-"+d.id) : "root")
            .select("path")
            .attr("d", arc)
            .style("opacity", d => d.depth ? null : 0)
            .style("fill", d => currentScale[d.prediction])
            .style("cursor", d => d.depth > 1 ? "pointer" : null);

            data.enter()
            .append("g")
            .attr("id", d => d.depth ? ("arc-sun-"+d.id) : "root")
            .append("path")
            .on("click", function(d) {
                if (d.depth > 1) {
                    drawArcs(d);
                }
            })
            .attr("d", arc)
            .attr("fill-rule", "evenodd")
            .style("fill", d => currentScale[d.prediction])
            .style("cursor", d => d.depth > 1 ? "pointer" : null)
            .style("opacity", d => d.depth ? null : 0)
            .on("mouseenter", function(d) {
                if (d.depth) {
                    mouseenter(d);
                } else {
                    mouseenter(d.children[0]);
                }
            });

            if(p.id) {
                d3.select("#root")
                .on("click", function() {
                    drawArcs(treeData[0]);
                })
                .style("cursor", "pointer")
                .append("text")
                .attr("id", "unzoom-msg")
                .text("Click to unzoom")
                .attr("x", function() {
                    return - this.getBoundingClientRect().width / 2;
                })
                .attr("y", d3.select("#percentage").attr("y") + 20)
            } else {
                d3.select("#root").on("click", null).style("cursor", null);
            }
        }

        drawArcs(treeData[0]);

        // Add the mouseleave handler to the bounding circle.
        d3.select("#container").on("mouseleave", mouseleave);
    }

    const updateBreadcrumbs = function(node, sampleString, colors) {
        d3.select("#trail").selectAll("g").remove();
        const g = d3.select("#trail");

        let crumbs = 0;
        let sunburstContainerHeight = d3.select(".tree-sunburst").node().getBoundingClientRect().height;
        while (node.parent && crumbs < Math.floor(sunburstContainerHeight / (b.h+b.s))) {
            g.insert("g", ":first-child")
                .attr("id", "bread-"+node.id)
                .append("polygon")
                .attr("points", function() {
                    return breadcrumbPoints(node.id);
                })
                .style("fill", colors[node.prediction]);

            d3.select("#bread-"+node.id).append("text")
                .attr("x", (b.w + b.t) / 2)
                .attr("y", b.h / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .text(node.id > 0 ? TreeInteractions.decisionRule(node) : "Whole population")
                .style("font-size", function(d){ // scale the font size according to text length
                    const newLength = this.textContent.length;
                    const charsPerLine = 50;
                    if (newLength < charsPerLine){
                        return "15px";
                    }
                    const newEmSize = charsPerLine / newLength;
                    const textBaseSize = 13;
                    const newFontSize = (2 - newEmSize)*newEmSize * textBaseSize;
                    if (newFontSize >= 9) {
                        return newFontSize + "px";
                    } else {
                        this.textContent = Format.ellipsis(this.textContent, 130);
                        return "9px";
                    }
                });

            d3.select("#arc-sun-" + node.id).select("path").style("opacity", null);

            node = node.parent;
            crumbs++;
        }

        const breadcrumbs = d3.select("#trail").selectAll("g");

        breadcrumbs.attr("transform", function(d, i) {
            return "translate(0, " + i * (b.h + b.s) + ")";
        });

        // Now move and update the percentage at the end.
        d3.select("#trail").select("#endlabel")
            .attr("x", b.w / 2)
            .attr("y", (breadcrumbs[0].length + 0.5) * (b.h + b.s))
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .text(sampleString);
    }

    const updateColors = function(colors) {
        d3.select("#container").selectAll("path")
        .style("fill", d => colors[d.prediction]);

        currentScale = colors;
    }

    return {
        createSun: createSun,
        updateColors: updateColors
    }
});

app.controller("_TreeEditController", function($scope, $http, ModalService, TreeInteractions, SunburstInteractions, Format) {
    $scope.search = {
        feature: '',
        catSplitValue: ''
    };

    $scope.uiState = {};

    const side = 30;
    $scope.scales = {
        "Default": d3.scale.category20().range().concat(d3.scale.category20b().range()),
        "DSS Next": ["#00AEDB", "#8CC63F", "#FFC425", "#F37735", "#D11141", "#91268F", "#194BA3", "#00B159"],
        "Pastel": ["#EC6547", "#FDC665", "#95C37B", "#75C2CC", "#694A82", "#538BC8", "#65B890", "#A874A0"],
        "Corporate": ["#0075B2", "#818991", "#EA9423", "#A4C2DB", "#EF3C39", "#009D4B", "#CFD6D3", "#231F20"],
        "Deuteranopia": ["#193C81", "#7EA0F9", "#211924", "#757A8D", "#D6C222", "#776A37", "#AE963A", "#655E5D"],
        "Tritanopia": ["#CA0849", "#0B4D61", "#E4B2BF", "#3F6279", "#F24576", "#7D8E98", "#9C4259", "#2B2A2E"],
        "Pastel 2": ["#f06548", "#fdc766", "#7bc9a6", "#4ec5da", "#548ecb", "#97668f", "#5e2974"]
    };

    $scope.displayScale = function(scale) {
        if (!scale) return [];
        return scale.slice(0,5);
    };

    $scope.setScale = function(scaleName) {
        $scope.selectedScale = $scope.scales[scaleName];
        $scope.colors = {};
        angular.forEach($scope.targetValues, function(value, key) {
            $scope.colors[value] = $scope.selectedScale[key%$scope.selectedScale.length];
        });

        if (!$scope.selectedNode) return;

        if ($scope.template === "sun") {
            SunburstInteractions.updateColors($scope.colors);
        }
        else {
            TreeInteractions.select($scope.selectedNode.id, $scope, false, true);
            if ($scope.template === "viz") {
                TreeInteractions.updateTooltipColors($scope.colors);
            }
        }
    };

    $scope.closeColorPicker = function(event) {
        if (event.target.matches('.color-picker') || event.target.matches('.icon-tint')) return;
        $scope.displayColorPicker = false;
    };

    $scope.recreateSplits = function(nodes) {
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
    };

    $scope.save = function() {
        ModalService.create($scope, {
            title: "Save as",
            confirmAction: (fileName) => save(fileName),
            promptConfig: {
                result: $scope.config.file,
                label: "Filename",
                conditions: {
                    type: "text",
                    "ng-pattern": "/^[/_A-Za-z0-9-]+$/",
                    placeholder: "Letters, numbers, /, -, _"
                }
            }
        });
    };

    $scope.saveShortcut = function(event) {
        if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
            $scope.save();
            event.preventDefault();
        }
    };

    const save = function(filename) {
        $scope.config.file = filename;
        $http.post(getWebAppBackendUrl("save"), {"filename": filename + ".json"})
        .then(function() {
            $scope.isSaved = true;
        }, function(e) {
            ModalService.createBackendErrorModal($scope, e.data);
        });
    };

    $scope.close = function(force) {
        if (!$scope.isSaved && !force) {
            ModalService.create($scope, {
                title: "Exit without saving",
                confirmAction: () => $scope.close(true),
                isDangerousAction: true,
                msgConfig: {
                    msg: "Are you sure you want to exit without saving? All unsaved changes will be lost."
                }
            });
            return;
        }
        delete $scope.config.file;
        delete $scope.config.dataset;
        $scope.setTemplate('create');
    };

    $scope.zoomFit = function() {
        TreeInteractions.zoomFit($scope.template == "viz");
    };

    $scope.zoomBack = function() {
        TreeInteractions.zoomBack($scope.selectedNode);
    };

    $scope.toFixedIfNeeded = function(number, decimals, precision) {
        const lowerBound = 5 * Math.pow(10, -decimals-1);
        if (number && Math.abs(number) < lowerBound) {
            if (precision) { // indicates that number is very small instead of rounding to 0 (given that number is positive)
                return "<" + lowerBound;
            }
            return 0;
        }
        return Format.toFixedIfNeeded(number, decimals);
    };

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
            ModalService.createBackendErrorModal($scope, e.data);
        });
    };

    $scope.resetLabel = function() {
        const label = d3.select("#node-"+$scope.selectedNode.id).select(".label-node");
        if (label.node()) {
            $scope.selectedNode.label = label.text();
        } else {
            delete $scope.selectedNode.label;
        }
        delete $scope.selectedNode.editLabel;
    };

    $scope.enableLabelEdit = function() {
        $scope.selectedNode.editLabel = true;
    };

    $scope.chooseFeature = function(feature) {
        $scope.search.feature = '';
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
                ModalService.createBackendErrorModal($scope, e.data);
            });
        } else {
            $scope.createSplit($scope.treatedAsNum(feature));
        }
    };

    $scope.createSplit = function(isNum) {
        if (isNum){
            $scope.selectedSplit = {"value": 0};
        } else {
            $scope.selectedSplit = {"value": new Set()};
            $scope.selectedSplit.usedValues = getUsedValues($scope.splits[$scope.selectedNode.id], true);
            $scope.selectedSplit.selectAll = false;
            $scope.disableAddSplit = true;
        }
    };

    $scope.selectSplit = function(split, isNum) {
        $scope.search.catSplitValue = '';
        $scope.selectedSplit = split;
        if (!isNum) {
            $scope.selectedSplit.usedValues = getUsedValues($scope.splits[$scope.selectedNode.id]);
            $scope.selectedSplit.value = new Set($scope.treeData[split.left].values);
        } else {
            $scope.selectedSplit.value = $scope.treeData[split.left].end;
        }
    };

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
    };

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
    };

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
    };

    $scope.changeNumValue = function() {
        $scope.disableAddSplit = $scope.selectedSplit.value == undefined;
    };

    $scope.cancel = function() {
        delete $scope.selectedSplit;
        if (!$scope.splits[$scope.selectedNode.id]) {
            delete $scope.selectedNode.featureChildren;
        }
    };

    $scope.treatedAsNum = function(feature) {
        return feature in $scope.selectedNode.treated_as_numerical;
    };

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
            $scope.loadingHistogram = false;
            ModalService.createBackendErrorModal($scope, e.data);
        });
    };

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
    };

    $scope.autosplit = function() {
        ModalService.create($scope, {
            title: "Auto-create splits",
            confirmAction: (maxSplits) => autosplit(parseFloat(maxSplits)),
            msgConfig: {
                msg: "This will automatically create some splits on the currently selected node"
            },
            promptConfig: {
                label: "Maximum number of splits",
                conditions: {min: 1, type: "number", step: 1}
            }
        });
    };

    const autosplit = function(maxSplits) {
        $scope.loadingTree = true;
        $http.post(getWebAppBackendUrl("/auto-split"),
            {nodeId: $scope.selectedNode.id, feature: $scope.selectedNode.featureChildren, maxSplits: maxSplits})
        .then(function(response) {
            delete $scope.selectedSplit;
            $scope.treeData = response.data;
            $scope.selectedNode.children_ids = $scope.treeData[$scope.selectedNode.id].children_ids;
            if (!$scope.selectedNode.children_ids.length) {
                delete $scope.selectedNode.featureChildren;
                ModalService.create($scope, {
                    title: "Auto-creation: no split",
                    msgConfig: {
                        msg: "No split could be formed"
                    }
                });
                $scope.loadingTree = false;
                return;
            }
            $scope.isSaved = false;
            $scope.recreateSplits([$scope.selectedNode]);
            TreeInteractions.select($scope.selectedNode.id, $scope);

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
            ModalService.createBackendErrorModal($scope, e.data);
        });
    };

    $scope.checkBeforeAdd = function(split, feature) {
        if (!$scope.selectedNode.isLeaf && $scope.treatedAsNum(feature)) {
            const newSplitInfo = checkSplitNode($scope.selectedNode, split);
            // if new split splits another node (ie. value between the lower and upper bound of the node)
            if (newSplitInfo.left_idx > -1 && newSplitInfo.right_idx > -1) {
                const nodeToBeSplit = $scope.treeData[$scope.selectedNode.children_ids[newSplitInfo.right_idx]];
                if (nodeToBeSplit.children_ids.length) {
                    const msg = "Creating a split at " + split.value + " will affect downstream parts of your decision tree.\
                        \nYou will lose all branches below the node '"
                        + TreeInteractions.decisionRule(nodeToBeSplit, true) + "'";
                    ModalService.create($scope, {
                        title: "Split creation: warning",
                        confirmAction: () => add(split, feature, nodeToBeSplit),
                        isDangerousAction: true,
                        msgConfig: { msg }
                    });
                    return;
                }
            }
        }
        add(split, feature);
    };

    const add = function(split, feature, nodeToBeSplit) {
        $scope.loadingTree = true;
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

            $scope.treeData = response.data;
            TreeInteractions.select($scope.selectedNode.id, $scope);
            $scope.recreateSplits([$scope.selectedNode]);
            if (nodeToBeSplit) {
                nodeToBeSplit = $scope.treeData[nodeToBeSplit.id];
                d3.select("#node-" + nodeToBeSplit.id).select(".feature-children").remove();
                delete $scope.splits[nodeToBeSplit.id];
            }
        }, function(e) {
            $scope.loadingTree = false;
            ModalService.createBackendErrorModal($scope, e.data);
        });
    };

    $scope.checkBeforeUpdate = function(split, feature) {
        if ($scope.treatedAsNum(feature)) {
            const belowLowerBound = $scope.treeData[split.left].beginning && $scope.treeData[split.left].beginning > split.value;
            const aboveUpperBound = $scope.treeData[split.right].end && $scope.treeData[split.right].end < split.value;
            if (belowLowerBound || aboveUpperBound) {
                const newSplitInfo = checkSplitNode($scope.selectedNode, split);
                if (newSplitInfo.left_idx > -1 && newSplitInfo.right_idx > -1) {
                    const nodeToBeSplit = $scope.treeData[$scope.selectedNode.children_ids[newSplitInfo.right_idx]];
                    const nodeToBeMoved = belowLowerBound ? $scope.treeData[split.left] : $scope.treeData[split.right];
                    let askForConfirmation;
                    let msg = "\Updating this split  will affect downstream parts of your decision tree. You will lose all branches below the node '";
                    if (nodeToBeSplit.children_ids.length) {
                        msg += TreeInteractions.decisionRule(nodeToBeSplit, true) + "'";
                        askForConfirmation = true;
                    }
                    if (nodeToBeMoved.children_ids.length) {
                        msg += (askForConfirmation ? " and the node '" : "") +  TreeInteractions.decisionRule(nodeToBeMoved, true) + "'";
                        askForConfirmation = true;
                    }
                    if (askForConfirmation) {
                        ModalService.create($scope, {
                            title: "Split edit: warning",
                            confirmAction: () => update(split, feature, nodeToBeSplit, nodeToBeMoved),
                            isDangerousAction: true,
                            msgConfig: { msg }
                        });
                        return;
                    }
                }
            }
        }
        update(split, feature);
    };

    const update = function(split, feature, nodeToBeSplit, nodeToBeMoved) {
        $scope.loadingTree = true;
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
            TreeInteractions.select($scope.selectedNode.id, $scope);
            $scope.recreateSplits([$scope.selectedNode]);
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
        }, function(e) {
            $scope.loadingTree = false;
            ModalService.createBackendErrorModal($scope, e.data);
        });
    };

    $scope.submit = function(split, feature) {
        if ($scope.disableAddSplit) return;
        if (split.left) {
            $scope.checkBeforeUpdate(split, feature);
        } else {
            $scope.checkBeforeAdd(split, feature);
        }
    };

    $scope.confirmDelete = function(split, splits, feature) {
        let msg = "This will delete ";
        if (splits.length > 1) {
            msg += "the node '" + TreeInteractions.decisionRule($scope.treeData[split.left], true) + "' and all the branches and nodes below";
        } else {
            msg += "the nodes '"
                    + TreeInteractions.decisionRule($scope.treeData[split.left], true) + "' and '"
                    + TreeInteractions.decisionRule($scope.treeData[split.right], true) +  "' and all the branches and nodes below them";
        }
        ModalService.create($scope, {
            title: "Delete a split",
            confirmAction: () => del(split, feature),
            isDangerousAction: true,
            msgConfig: { msg }
        });
    };

    $scope.confirmDeleteAll = function() {
        ModalService.create($scope, {
            title: "Delete all splits",
            confirmAction: deleteAllSplits,
            isDangerousAction: true,
            msgConfig: { msg: "This will delete all the branches and nodes below the currently selected node" }
        });
    };

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

            $scope.treeData = response.data;
            TreeInteractions.select($scope.selectedNode.id, $scope);
            if ($scope.splits[$scope.selectedNode.id].length == 1) {
                delete $scope.splits[$scope.selectedNode.id];
                d3.select("#node-" + $scope.selectedNode.id).select(".feature-children").remove();
            } else {
                $scope.recreateSplits([$scope.selectedNode]);
            }
        }, function(e) {
            $scope.loadingTree = false;
            ModalService.createBackendErrorModal($scope, e.data);
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
            $scope.treeData = response.data;
            d3.select("#node-" + $scope.selectedNode.id).select(".feature-children").remove();
            TreeInteractions.select($scope.selectedNode.id, $scope);
        }, function(e) {
            $scope.loadingTree = false;
            ModalService.createBackendErrorModal($scope, e.data);
        });
    }
});
