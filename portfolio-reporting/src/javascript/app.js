Ext.define("TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'message_box',layout:{type:'hbox'}},
        {xtype:'container',itemId:'filter_box'},        
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "TSApp"
    },
    
    selectedPILevel: ['PortfolioItem/Feature'],

    modelNames: ['PortfolioItem','HierarchicalRequirement','Task'],

    launch: function() {
        var me = this;
        console.log('in launch');

        me._addSelector();
        
    },

    _addSelector: function(){
        var me = this;
        me.down('#message_box').add([{
                name: 'selectorType',
                itemId: 'selectorType',
                fieldLabel: 'Select PI Type:',
                width: 450,
                labelWidth: 100,
                margin: '10 10 10 10',                
                xtype: 'rallyportfolioitemtypecombobox',
                valueField: 'TypePath',
                readyEvent: 'ready',
                listeners: {
                    // ready: function() {
                    //     me.updateView([]);
                    // },
                    change: function(){
                        me.updateView([]);
                    },
                    scope: me
                }
            },
            {
                xtype: 'rallyfieldpicker',
                name: 'columnNames',
                itemId: 'columnNames',
                fieldLabel: 'Choose Fields',
                width: 250,
                margin: '10 10 10 10',    
                autoExpand: false,
                alwaysExpanded: false,
                modelTypes: me.modelNames,
                alwaysSelectedValues: me._getSelectedColumns(),
                fieldBlackList: ['Attachments','Children'],
                listeners:{
                    select: function(){
                        me.updateView([]);
                    },
                    scope:me
                }
            },
            {
                xtype: 'rallyinlinefiltercontrol',
                name: 'inlineFilter',
                itemId: 'inlineFilter',
                margin: '10 10 10 10',                           
                context: me.getContext(),
                height:26,
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: me.getContext().getScopedStateId('inline-filter'),
                    context: me.getContext(),
                    modelNames: ['PortfolioItem/Feature'],
                    filterChildren: false,
                    inlineFilterPanelConfig: {
                        quickFilterPanelConfig: {
                            defaultFields: ['ArtifactSearch', 'Owner']
                        }
                    },
                    listeners: {
                        inlinefilterchange: me._onFilterChange,
                        inlinefilterready: me._onFilterReady,
                        scope: me
                    } 
                }
            }
            // ,
            // {
            //     xtype:'rallybutton',
            //     itemId:'export_button',
            //     text: 'Download CSV',
            //     margin:10,

            //     disabled: false,
            //     iconAlign: 'right',
            //     listeners: {
            //         scope: this,
            //         click: function() {
            //             me._export();
            //         }
            //     },
            //     margin: '10',
            //     scope: me
            // }
        ]);

    },

    _onFilterChange: function(inlineFilterButton){
        var me = this;
        var filters = inlineFilterButton.getTypesAndFilters().filters;
        me.updateView(filters);
    },

    _onFilterReady: function(inlineFilterPanel) {
        var me = this;
        me.down('#filter_box').add(inlineFilterPanel);
    },


    _getSelectedPIs: function(selectedPI){
        var me = this;
        var config = {
                        model : selectedPI,
                        fetch : ['ObjectID'],
                        //filters : Rally.data.wsapi.Filter.or(story_filters),
                        limit:'Infinity'
                    }
        return me._loadWsapiRecords(config);
    },

    _getTasks: function(filters){
        var me = this;
        var config = {
                        model : 'Task',
                        fetch : ['ObjectID','TimeSpent','Estimate'],
                        filters : Rally.data.wsapi.Filter.or(filters),
                        limit:'Infinity',
                        enablePostGet:true
                    }
        return me._loadWsapiRecords(config);
    },    

    _getPortfolioItemTimeEntries: function(startindex, pagesize){
        var deferred = Ext.create('Deft.Deferred');

        if (!startindex){
            startindex = 1;
        }
        if (!pagesize){
            pagesize = 2000;
        }

        Ext.Ajax.request({
            url: Ext.String.format("/slm/webservice/v2.0/PortfolioItemTimeEntry?fetch=true&start={1}&pagesize={0}", pagesize, startindex),
            success: function(response){
                if (response && response.responseText){
                    var obj = Ext.JSON.decode(response.responseText);
                    deferred.resolve(obj);
                } else {
                    deferred.resolve(null);
                }
            }
        });

        return deferred.promise;
    },    

    updateView: function(filters){
        var me = this;

        if(!me.down('#selectorType')) return;

        console.log('update view filters',filters);
        me.selectedPILevel = [me.down('#selectorType').getValue()];

        var pi_object_ids = [];

        me.totalTaskEstimate = 0;
        me.totalTaskTimeSpent = 0;        

        me._getSelectedPIs(me.selectedPILevel[0]).then({
            success: function(records){
                Ext.Array.each(records,function(pi){
                    pi_object_ids.push(pi.get('ObjectID'));
                });

                me._getTasksFromSnapShotStore(pi_object_ids).then({
                    success: function(results){
                        console.log('all taks from snapshot store',results);
                        me.totalTaskEstimate = 0;
                        me.lb_task_results = results[1];
                        Ext.Array.each(results[1],function(task){
                            me.totalTaskEstimate += task.get('Estimate') || 0;
                        });
                        var task_filter = [];
                        Ext.Array.each(results[1], function(task){
                            task_filter.push({property:'WorkProduct.ObjectID',value:task.get('_ItemHierarchy')[task.get('_ItemHierarchy').length - 2]});
                        });


                        me._getTasks(task_filter).then({
                            success: function(records){
                                me.totalTaskTimeSpent = 0;
                                me.taskTimeSpent = {}
                                Ext.Array.each(records,function(task){
                                    me.totalTaskTimeSpent += task.get('TimeSpent') || 0;
                                    me.taskTimeSpent[task.get('ObjectID')] = task.get('TimeSpent') || 0;
                                });
                                Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
                                    models: me.selectedPILevel,
                                    autoLoad: true,
                                    enableHierarchy: true,
                                    filters: filters
                                }).then({
                                    success: me._addGrid,
                                    scope: me
                                });

                            },
                            scope: me
                        });

                    },
                    scope: me
                });

            },
            scope: me         
        });

    },

    _updateAssociatedData: function(store, node, records, success){
        var me = this;
        //me.setLoading("Loading..");
        //this.logger.log('_updateAssociatedData', store, node, records, success);

        Ext.Array.each(records,function(r){
            var totalEstimate = 0;
            var totalTimeSpent = 0;

            Ext.Array.each(me.lb_task_results,function(lbTask){
                if(Ext.Array.contains(lbTask.get('_ItemHierarchy'),r.get('ObjectID'))){
                    totalEstimate += lbTask.get('Estimate') || 0;
                    totalTimeSpent += me.taskTimeSpent[lbTask.get('ObjectID')];
                }
            });
            r.set('Estimate',totalEstimate);
            r.set('TimeSpent',totalTimeSpent);
        });

    },


    _getTasksFromSnapShotStore:function(piObjectIDs){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var find = {
                        "_TypeHierarchy": "Task",
                        "_ItemHierarchy": { $in: piObjectIDs }
                    };
        find["__At"] = "current";

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "fetch": [ "ObjectID","Estimate","TimeSpent","_ItemHierarchy"],
            "find": find,
            "useHttpPost": true
        });

        snapshotStore.load({
            callback: function(records, operation) {
                deferred.resolve([piObjectIDs,records]);
            },
            scope:this
        });
    
        return deferred;
    },

    showErrorNotification: function(msg){
        Rally.ui.notify.Notifier.showError({message: msg});
    },

       
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        // this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },

    _loadAStoreWithAPromise: function(model_name, model_fields){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("Starting load:",model_name,model_fields);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: model_fields
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(this);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },

    _addGrid: function (store) {
        var me = this;
        //console.log('Tree store',store);
        store.on('load', me._updateAssociatedData, me);
        //console.log('columns ',me.getValue());
        me.down('#display_box').removeAll();
        me.down('#display_box').add({
            xtype: 'rallytreegrid',
            // stateful:true,
            // stateId:me.getContext().getScopedStateId('pi_task_rollup_grid'),
            context: this.getContext(),
            store: store,
            enableEditing: false,
            enableSummaryRow:true,
            scroll:'none',
            autoScroll:false,
            columnCfgs: me._getAllColumns(),
            height:this.getHeight()
        });
        me.setLoading(false);
    },

    getValue: function() {
        var value = {};
        Ext.Array.each(Ext.ComponentQuery.query('rallyfieldpicker',this), function(picker) {
            var fields = picker.getValue(); 
            
            value[picker._key] = Ext.Array.map(fields, function(field){
                return field.get('name');
            });
        });
        
        return Ext.JSON.encode(value);
    },

    _getAllColumns: function(){
        var me = this;
        var allColumns = me._getColumnCfgs();
        var selectedValues = me.down('#columnNames') && me.down('#columnNames').selectedValues.keys;
        var alwaysSelectedValues = me._getSelectedColumns();
        Ext.Array.each(selectedValues,function(val){
            if(!Ext.Array.contains(alwaysSelectedValues,val)){
                allColumns.push({dataIndex:val,text:val});
            }
        });
        return allColumns;
    },

    _getColumnCfgs: function(){
        var me = this;
        // console.log('selectedValues>>',me.down('#columnNames') && me.down('#columnNames').selectedValues.keys);
        // console.log('Allowed Values>>',me.down('#columnNames') && me.down('#columnNames').alwaysSelectedValues);

        return  [{
            dataIndex: 'Name',
            text: 'Name'
        },
        {
            dataIndex: 'ScheduleState',
            text: 'Schedule State'
        },
        {
            dataIndex: 'Owner',
            text: 'Owner'
        },
        {
            dataIndex: 'Estimate',
            text: 'Task Estimate',
            summaryType: 'sum',
            renderer: function(Estimate){
                return Ext.Number.toFixed(Estimate || 0,2);
            },
            summaryRenderer: function() {
                return '<span class="rollup">'+ Ext.Number.toFixed(me.totalTaskEstimate,2) +' Hours</span>';
            }
        },
        {
            dataIndex: 'TimeSpent',
            text: 'Task Time Spent',
            summaryType: 'sum',
            renderer: function(TimeSpent){
                return Ext.Number.toFixed(TimeSpent || 0,2);
            },            
            summaryRenderer: function() {
                return '<span class="rollup">'+ Ext.Number.toFixed(me.totalTaskTimeSpent,2) +' Hours</span>';
            }
        },
        {
            dataIndex: 'LeafStoryPlanEstimateTotal',
            text: 'LeafStory Plan Estimate Total',
            summaryType: 'sum'
            //,
            // summaryRenderer: function() {
            //     return '<b>' + me.totalLeafStoryPlanEstimateTotal +'</b>';
            // }
        },
        {
            dataIndex: 'PlanEstimate',
            text: 'Plan Estimate'
        },
        {
            dataIndex: 'AcceptedLeafStoryPlanEstimateTotal',
            text: 'Accepted LeafStory Plan Estimate Total',
            summaryType: 'sum'
            ,
            summaryRenderer: function(AcceptedLeafStoryPlanEstimateTotal) {
                return '<span class="rollup">'+ Ext.Number.toFixed(AcceptedLeafStoryPlanEstimateTotal,2) +' Points </span>';;
            }
        }];
    },

    _export: function(){
        var grid = this.down('rallytreegrid');
        var me = this;

        if ( !grid ) { return; }
        
        this.logger.log('_export',grid);
        window.location = Rally.ui.gridboard.Export.buildCsvExportUrl(grid);
        //var filename = Ext.String.format('portfolio_report.csv');

        // this.setLoading("Generating CSV");
        // Deft.Chain.sequence([
        //     function() { return Rally.technicalservices.FileUtilities._getCSVFromWsapiBackedGrid(grid) } 
        // ]).then({
        //     scope: this,
        //     success: function(csv){
        //         if (csv && csv.length > 0){
        //             Rally.technicalservices.FileUtilities.saveCSVToFile(csv,filename);
        //         } else {
        //             Rally.ui.notify.Notifier.showWarning({message: 'No data to export'});
        //         }
                
        //     }
        // }).always(function() { me.setLoading(false); });
    },

    _getSelectedColumns: function(){
        var me = this;
        var cols = [];
        Ext.Array.each(me._getColumnCfgs(),function(col){
            cols.push(col.dataIndex);
        });
        // console.log('_getSelectedColumns>>', cols)
        return cols;
    },
 
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
