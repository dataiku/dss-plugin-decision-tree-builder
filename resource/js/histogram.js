'use strict';
app.directive("histogram", function (Format, $compile) {
    return {
        scope: true,
        link: function ($scope) {
            const margin = {top: 15, bottom: 40, left: 40, right: 0},
                width = 415 - margin.left - margin.right,
                height = 195 - margin.top - margin.bottom;

            let histSvg = d3.select(".histogram-svg").append("svg")
                     .attr("width", "100%")
                     .attr("height", "100%")
                     .append("g")
                     .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            const x = d3.scale.ordinal().rangeRoundBands([0, width], .05);
            const y = d3.scale.linear().range([height, 0]);
            const xAxis = d3.svg.axis().scale(x).orient("bottom");
            const yAxis = d3.svg.axis().scale(y).orient("left");

            function update() {
                let data;
                if ($scope.treatedAsNum($scope.selectedNode.featureChildren)) {
                    const values = $scope.histData[$scope.selectedNode.featureChildren].bins;
                    data = values.map(function(d) {
                        const bar = [];
                        let y0 = 0;
                        $scope.selectedNode.probabilities.forEach(function(proba, i) {
                            if (d.target_distrib[proba[0]]) {
                                bar.push({x: d.mid,
                                    y: d.target_distrib[proba[0]],
                                    y0: y0,
                                    color: $scope.colors[proba[0]],
                                    interval: d.value
                                });
                                y0 += d.target_distrib[proba[0]];
                            }
                        });
                        return bar;
                    });
                    const maxValue = d3.max(values.map(_ => _.count));
                    yAxis.ticks(Math.min(5, maxValue))
                    y.domain([0, maxValue]);
                    x.domain(values.map(_ => _.mid));
                } else {
                    const values = $scope.histData[$scope.selectedNode.featureChildren].bins.slice(0, 10);
                    data = values.filter(_ => _.target_distrib).map(function(d) {
                        const bar = [];
                        let y0 = 0;
                        $scope.selectedNode.probabilities.forEach(function(proba, i) {
                            if (d.target_distrib[proba[0]]) {
                                bar.push({x: d.value,
                                    y: d.target_distrib[proba[0]],
                                    y0: y0,
                                    color: $scope.colors[proba[0]]
                                });
                                y0 += d.target_distrib[proba[0]];
                            }
                        });
                        return bar;
                    });
                    yAxis.ticks(Math.min(5, values[0].count))
                    y.domain([0, values[0].count]);
                    x.domain(values.map(_ => _.value));
                }

                histSvg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis)
                    .selectAll("text")
                    .style("text-anchor", "middle")
                    .attr("transform", "translate(-15,10) rotate(-45)")
                    .attr("dy", "1em");

                histSvg.selectAll(".tick text").text(function(d) {
                    return Format.ellipsis(d, 10);
                });

                histSvg.append("g")
                    .attr("class", "y axis")
                    .call(yAxis)
                    .append("text")
                    .attr("transform", "rotate(-90)")
                    .attr("y", 6)
                    .attr("dy", ".71em")
                    .style("text-anchor", "end")

                // Create groups for each series, rects for each segment
                let groups = histSvg.selectAll("g.bar")
                .data(data)
                .enter()
                .append("g");

                groups.selectAll("rect")
                .data(d => d)
                .enter()
                .append("rect")
                .style("fill", d => d.color)
                .attr("x", d => x(d.x))
                .attr("y", d => y(d.y0 + d.y))
                .attr("height", d => y(d.y0) - y(d.y0 + d.y))
                .attr("width", x.rangeBand());

                groups.on("mouseenter", function(d, i) {
                    histSvg.append("g")
                    .attr("tooltip", "histogram")
                    .classed("selected", true)
                    .attr("feature", $scope.selectedNode.featureChildren)
                    .attr("bin-index", i)
                    .call(function() {
                        $compile(this[0])($scope);
                    });

                    d3.select(this).style("opacity", .7);
                })
                .on("mousemove", function(d, i){
                    let xPosition = d3.mouse(this)[0] + 20;
                    let yPosition = d3.mouse(this)[1];
                    const histogramDim = d3.select(".histogram-svg").node().getBoundingClientRect();
                    const tooltipDim = {width: 190, height: 45 + Math.min(d.length, 5) * 22};
                    if (xPosition + 25 + tooltipDim.width > histogramDim.width) {
                        xPosition -= 30 + tooltipDim.width;
                    }
                    if (yPosition + 15 + tooltipDim.height > histogramDim.height) {
                        yPosition -= (yPosition + tooltipDim.height) - histogramDim.height + 15;
                    }
                    d3.select("[tooltip]").attr("transform", "translate(" + xPosition + "," + yPosition + ")");
                })
                .on("mouseleave", function() {
                    d3.select(this).style("opacity", null);
                    d3.select("[tooltip]").remove();
                });
            }

            $scope.$watch("selectedNode.featureChildren", function(nv) {
                if (nv) {
                    histSvg.selectAll("rect").remove();
                    histSvg.selectAll("g").remove();
                    update();
                }
            })
        }
    }
});