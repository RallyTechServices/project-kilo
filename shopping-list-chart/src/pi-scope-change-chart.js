var scope_change_chart = null;

Ext.define('Rally.technicalservices.scopeChangeChart',{
    extend: 'Rally.ui.chart.Chart',
    alias: 'widget.progresschart',

    itemId: 'rally-chart',
    chartData: {

    },
    loadMask: false,
    
    chartConfig: {
        chart: {
            type: 'column',
            zoomType: 'xy'
        },
        title: {
            text: 'Release Scope Change'
        },
        subtitle: {
            text: ''
        },
        xAxis: {
            title: {
                enabled : true,
                text: 'Day'
            },
            startOnTick: true,
            endOnTick: true,
            min : 0
        },
        yAxis: [
            {
                title: {
                    text: 'Points/Count'
                },
                plotLines : [{
                    color: '#000000',
                    width: 1,
                    value: 0,
                    zIndex : 4,
                    label : {text:"-"}
                }]
            }],

        tooltip : {
            formatter : function() {
                var p = this.point;
                return 'Features: <b>' + p.features.length + "</b> Value: <b>" + (p.y < 0 ? (p.y*-1) : p.y) + "</b>";
            }
        },

        plotOptions: {
            series : {
                dataLabels: {
                    enabled: true,
                    formatter: function() {
                        if (this.series.name==="ToDo") {
                            var remaining = _.compact(_.pluck(this.series.data.slice(this.x),"y"));
                            if (remaining.length==1) {
                                // get the load value
                                var data = (_.last(this.series.chart.series)).data;
                                if (data.length===0)
                                    return "";
                                var value = data[this.x].y;
                                return ""+Math.round(value)+"%";
                            }
                        }
                    }
                },
                point : {
                    events : {
                        click : function(a) {
                            scope_change_chart.fireEvent("series_click",this);
                        }
                    }
                },
                pointPadding: 0.1,
                groupPadding: 0,
                borderWidth: 0
            },
            column : {
                stacking : 'normal'
            }
        }
    },

    initComponent : function() {
        this.callParent(arguments);
        this.addEvents('series_click');
    },

    constructor: function (config) {

        scope_change_chart = this;

        this.chartData = config.chartData;

        if (config.title){
            this.chartConfig.title = config.title;
        }
        this.chartConfig.xAxis.plotLines = _.map(config.iterationIndices,function(i){
            return {
                color : '#888888',
                width : 1,
                value : i
            };
        });
        if (config.baselineIndex>=0) {
            this.chartConfig.xAxis.plotLines.push({
                    color : '#FF0000',
                    width : 2,
                    value : config.baselineIndex

            });
        }
        // show a last plotline to show the end of the release
        // console.log("last date",config.releaseDateString,_.last(config.dateRange));
        this.chartConfig.xAxis.plotLines.push({
                color : 'gray',
                dashStyle: 'dash',
                width : 2,
                value : _.first(config.chartData.series).data.length,
                label: {
                    text: config.releaseDateString,
                    verticalAlign: 'top',
                    textAlign: 'left',
                    x : 10
                }
        });

        this.chartColors = config.chartColors;
        this.callParent(arguments);
    }
});