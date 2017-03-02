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
        console.log(me._getSelectedColumns());
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
                readyEvent: 'ready'
                ,
                listeners: {
                    ready: function() {
                        //me._updateGrid([]);
                        me.updateView([]);
                    },
                    change: function(){
                        //me._updateGrid([]);
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
                        //me._updateGrid([]);
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
                    modelNames: ['PortfolioItem'],
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

    updateView: function(filters){
        var me = this;
        me.selectedPILevel = [me.down('#selectorType').getValue()];

        var pi_object_ids = [];

        me.totalTaskEstimate = 0;
        me.totalTaskTimeSpent = 0;        

        me._getSelectedPIs(me.selectedPILevel[0]).then({
            success: function(records){
                Ext.Array.each(records,function(pi){
                    pi_object_ids.push(pi.get('ObjectID'));
                });
                
                console.log('all pi objectids',pi_object_ids);
                me._getTasksFromSnapShotStore(pi_object_ids).then({
                    success: function(results){
                        console.log('all taks from snapshot store',results);
                        me.lb_task_results = results[1];
                        Ext.Array.each(results[1],function(task){
                            me.totalTaskEstimate += task.get('Estimate') || 0;
                            me.totalTaskTimeSpent += task.get('TimeSpent') || 0;
                        });
                        //add tree grid
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


    getFeatureName: function(){
        return 'Feature';
    },

    updateAssociatedData: function(store, node, records, success){
        var me = this;
        //me.setLoading("Loading..");
        this.logger.log('updateAssociatedData', store, node, records, success);

        Ext.Array.each(records,function(r){
            var totalEstimate = 0;
            var totalTimeSpent = 0;            
            Ext.Array.each(me.lb_task_results,function(lbTask){
                if(Ext.Array.contains(lbTask.get('_ItemHierarchy'),r.get('ObjectID'))){
                    totalEstimate += lbTask.get('Estimate') || 0;
                    totalTimeSpent += lbTask.get('TimeSpent') || 0;                    
                }
            });
            r.set('Estimate',totalEstimate);
            r.set('TimeSpent',totalTimeSpent);
        });


        // var promises = []; 
        // Ext.Array.each(records, function(r){
        //     promises.push(me._getTasksFromSnapShotStore([r.get('ObjectID')]));
        // });

        // //Task Estimates & TimeSpent from lookback
        // Deft.Promise.all(promises,me).then({
        //     success: function(results){
        //         console.log('tasks>> promises',results);
        //         Ext.suspendLayouts();
        //         Ext.Array.each(records,function(rec){
        //             Ext.Array.each(results,function(res){
        //                 if(rec.get('ObjectID') == res[0]){
        //                     var totalEstimate = 0;
        //                     var totalTimeSpent = 0;
        //                     Ext.Array.each(res[1],function(lbRec){
        //                         totalEstimate += lbRec.get('Estimate') || 0;
        //                         totalTimeSpent += lbRec.get('TimeSpent') || 0;
        //                     });
    
        //                     rec.set('Estimate',totalEstimate);
        //                     rec.set('TimeSpent',totalTimeSpent);
        //                 }
        //             });
        //         });
        //         Ext.resumeLayouts(true);
        //     },
        //     scope: me
        // });

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
        this.logger.log("Starting load:",config.model);
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
        console.log('Tree store',store);
        store.on('load', me.updateAssociatedData, me);
        console.log('columns ',me.getValue());
        me.down('#display_box').removeAll();
        me.down('#display_box').add({
            xtype: 'rallytreegrid',
            context: this.getContext(),
            store: store,
            enableSummaryRow:true,
            columnCfgs: me._getAllColumns(),
            height: this.getHeight()
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
        console.log('selectedValues>>',me.down('#columnNames') && me.down('#columnNames').selectedValues.keys);
        console.log('Allowed Values>>',me.down('#columnNames') && me.down('#columnNames').alwaysSelectedValues);

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
                return Estimate || 0;
            },
            summaryRenderer: function() {
                return '<span class="rollup">'+ me.totalTaskEstimate +' Hours</span>';
            }
        },
        {
            dataIndex: 'TimeSpent',
            text: 'Task Time Spent',
            summaryType: 'sum',
            renderer: function(TimeSpent){
                return TimeSpent || 0;
            },            
            summaryRenderer: function() {
                return '<span class="rollup">'+ me.totalTaskTimeSpent +' Hours</span>';
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
                return '<span class="rollup">'+ AcceptedLeafStoryPlanEstimateTotal +' Points </span>';;
            }
        }];
    },

    _getSelectedColumns: function(){
        var me = this;
        var cols = [];
        Ext.Array.each(me._getColumnCfgs(),function(col){
            cols.push(col.dataIndex);
        });
        console.log('_getSelectedColumns>>', cols)
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
