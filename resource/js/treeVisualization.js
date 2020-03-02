'use strict';
app.service("TreeInteractions", function($http, $timeout,  $compile, Format) {
    let svg, tree, currentPath = new Set();
    const side = 30;
    const drag = d3.behavior.drag().origin(function(d) { return d; })

    const zoom = function() {
        svg.attr("transform",  "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")")
    };

    const zoomListener = d3.behavior.zoom()
        .scaleExtent([0, 3])
        .on("zoom", zoom);

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
        const scale = zoomListener.scale(),
            treePanel = d3.select(".tree").node().getBoundingClientRect(),
            svgDim = svg.node().getBoundingClientRect();
        const ratioX = treePanel.width / (svgDim.width/scale),
            ratioY = treePanel.height / ((svgDim.height+(vizMode ? 40 : 20))/scale);

        const ratio = Math.min(ratioX, ratioY, 1);
        let leftTranslate;
        if ((-zoomListener.translate()[0] + svgDim.right)*(ratio/scale) > treePanel.width / 2) {
            leftTranslate = 8 + (zoomListener.translate()[0] - svgDim.left)*(ratio/scale);
        } else {
            leftTranslate =  treePanel.width / 2;
        }
        zoomListener.translate([leftTranslate, (vizMode ? 40 : 20)]).scale(ratio);
        svg.transition(400)
            .attr("transform", "translate(" + leftTranslate + "," + (vizMode ? 40 : 20) +")scale(" + ratio + ")");
    };

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

    const select = function(id, scope) {
        if(scope.selectedNode) {
            //if (scope.selectedNode.id == id) {return;}
            delete scope.selectedNode.editLabel;
        }
        if (scope.selectedNode) {
            update(scope);
            hideUnselected(scope.selectedNode.id);
        }
        showSelected(id, scope);
        shift(id, scope, "selected");
        scope.search = {};
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
                    scope.loadingHistogram = true;
                    scope.createModal.error(e.data);
                });
            }
        } else {
            scope.selectedNode.isLeaf = true;
            delete scope.selectedNode.featureChildren;
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
        select(0, scope);
        zoomBack(scope.selectedNode);
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
        .style("fill", function(d) {return scope.colors[d.prediction] || "black"});

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
            centerOnNode(scope.selectedNode);
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
        })
        .call(drag);

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

    return {
        update: update,
        createTree: createTree,
        decisionRule: decisionRule,
        zoomFit: zoomFit,
        zoomBack: zoomBack,
        addVizTooltips: addVizTooltips,
        select: select,
        shift: shift
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

    const createSun = function(treeData, colors) {
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
            updateBreadcrumbs(d, d.samples[0] + " samples", colors);
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
            .style("fill", d => colors[d.prediction])
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
            .style("fill", d => colors[d.prediction])
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
        let sunburstContainerHeight = d3.select("#sunburst").node().getBoundingClientRect().height;
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

    return {
        createSun: createSun
    }
});