Ext.define("TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'top_box',layout:{type:'hbox'},items: [{xtype:'container',itemId:'message_box',layout:{type:'hbox'}},
        {xtype:'container',itemId:'totals_box', layout:{type:'hbox',align: 'right'}}]},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "TSApp"
    },
    
    selectedPILevel: null,

    launch: function() {
        var me = this;
        console.log('in launch');
        me.fetchPortfolioItemTypes().then({
            success: function(records){
                //add UserStory
                records.push({'name':'UserStory','typePath':'hierarchicalrequirement'})
                me._addSelector(records);
            },
            scope:me
        });
        
    },

    _addSelector: function(records){
        var me = this;
        var store = Ext.create('Ext.data.Store', {
            fields: ['name', 'typePath'],
            data : records
        });        
        me.down('#message_box').add([
            {
                xtype: 'combobox',
                name: 'selectorType',
                itemId: 'selectorType',
                stateful: true,
                stateId: me.getContext().getScopedStateId('selectorType'),   
                fieldLabel: 'Select Artifact Type:',
                store: store,
                queryMode: 'local',
                displayField: 'name',
                valueField: 'typePath',
                margin: '10 10 10 10', 
                width: 450,
                labelWidth: 100
            },
            {
                xtype: 'rallybutton',
                text: 'Go',
                margin: '10 10 10 10',                
                cls: 'primary',
                listeners: {
                    click: me.updateView,
                    scope: me
                }
            }
        ]);
    },


    _getSelectedPIs: function(selectedPI,filters){
        var me = this;
        var config = {
                        model : selectedPI,
                        fetch : ['ObjectID','AcceptedLeafStoryPlanEstimateTotal','LeafStoryPlanEstimateTotal','PlanEstimate','ScheduleState','Parent'],
                        limit:'Infinity'
                    }
        if(filters){
            config['filters'] = filters;
        }
        return me._loadWsapiRecords(config);
    },

    // _getTasks: function(filters){
    //     var deferred = Ext.create('Deft.Deferred');
    //     var me = this;

    //     Ext.create('CArABU.technicalservices.chunk.Store',{
    //         storeConfig: {
    //             model: 'Task',
    //             fetch: ['ObjectID','TimeSpent','Estimate','ToDo'],
    //         },
    //         chunkProperty: 'WorkProduct.ObjectID',
    //         chunkValue: filters
    //     }).load().then({
    //         success: function(records){
    //             deferred.resolve(records);
    //         },
    //         failure: me.showErrorNotification,
    //         scope: me
    //     });

    //     return deferred.promise;

    // },    

    _getTasks: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        Ext.create('CArABU.technicalservices.chunk.Store',{
            storeConfig: {
                model: 'TimeEntryValue',
                fetch: ['ObjectID','TimeEntryItem','Task','Hours'],
            },
            chunkProperty: 'TimeEntryItem.Task.ObjectID',
            chunkValue: filters
        }).load().then({
            success: function(records){
                deferred.resolve(records);
            },
            failure: me.showErrorNotification,
            scope: me
        });

        return deferred.promise;

    },    

    _getTimeEntryValues: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        Ext.create('CArABU.technicalservices.chunk.Store',{
            storeConfig: {
                model: 'TimeEntryValue',
                fetch: ['ObjectID','TimeEntryItem','WorkProduct','Hours'],
            },
            chunkProperty: 'TimeEntryItem.WorkProduct.ObjectID',
            chunkValue: filters,
            filters: [{
                        property:'TimeEntryItem.Task',
                        value:null
                    }]
        }).load().then({
            success: function(records){
                deferred.resolve(records);
            },
            failure: me.showErrorNotification,
            scope: me
        });

        return deferred.promise;

    },  

    updateView: function(){
        var me = this;

        if(!me.down('#selectorType')) return;

        me.selectedPILevel = [me.down('#selectorType').value];
        var pi_object_ids = [];

        me.setLoading(true);
        me._getSelectedPIs(me.selectedPILevel[0]).then({
            success: function(records){
                // console.log('_getSelectedPIs>>',records);
                Ext.Array.each(records,function(r){
                    pi_object_ids.push(r.get('ObjectID'));
                });


                Deft.Promise.all([me._getTasksFromSnapShotStore(pi_object_ids), me._getWorkProductsFromSnapShotStore(pi_object_ids)],me).then({
                    success: function(results){

                        me.lb_task_results = results[0][1];
                        var task_filter = [];
                        Ext.Array.each(results[0][1], function(task){
                            //task_filter.push(task.get('_ItemHierarchy')[task.get('_ItemHierarchy').length - 2]);
                            task_filter.push(task.get('_ItemHierarchy')[task.get('_ItemHierarchy').length - 1]);
                        });

                        me.lb_wp_results = results[1][1];
                        var wp_filter = [];
                        Ext.Array.each(results[1][1], function(wp){
                            wp_filter.push(wp.get('_ItemHierarchy')[wp.get('_ItemHierarchy').length - 1]);
                        });                        

                       Deft.Promise.all([me._getTasks(task_filter), me._getTimeEntryValues(wp_filter)],me).then({

                            success: function(records){
                                console.log('_getTasks>>',records);
                                me.taskTimeSpent = {}
                                // Ext.Array.each(records[0],function(task){
                                //     me.taskTimeSpent[task.get('ObjectID')] = task.get('TimeSpent') || 0;
                                // });

                                Ext.Array.each(records[0],function(tev){
                                    var task_object_id = tev.get('TimeEntryItem') && tev.get('TimeEntryItem').Task && tev.get('TimeEntryItem').Task.ObjectID;
                                    if(task_object_id){ 
                                        if(me.taskTimeSpent[task_object_id]){
                                            me.taskTimeSpent[task_object_id] += tev.get('Hours') || 0;
                                        }else{
                                            me.taskTimeSpent[task_object_id] = tev.get('Hours') || 0;
                                        }
                                    }else{
                                        console.log('Not associated with WorkProduct',tev)
                                    }
                                });

                                me.wpTimeSpent = {}
                                Ext.Array.each(records[1],function(tev){
                                    var wp_object_id = tev.get('TimeEntryItem') && tev.get('TimeEntryItem').WorkProduct && tev.get('TimeEntryItem').WorkProduct.ObjectID;
                                    if(wp_object_id){ 
                                        if(me.wpTimeSpent[wp_object_id]){
                                            me.wpTimeSpent[wp_object_id] += tev.get('Hours') || 0;
                                        }else{
                                            me.wpTimeSpent[wp_object_id] = tev.get('Hours') || 0;
                                        }
                                    }else{
                                        console.log('Not associated with WorkProduct',tev)
                                    }
                                });

                                Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
                                    models: me.selectedPILevel,
                                    enableHierarchy: true
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
        me.suspendLayouts();
        Ext.Array.each(records,function(r){
            // if(r.get('_type') == "hierarchicalrequirement" && r.get('Parent') != null){
            //     r.parentNode.removeChild(r);
            // }else{
                var totalEstimate = 0;
                var totalTimeSpent = 0;
                var totalToDo = 0;
                var totalDiff = 0;
                Ext.Array.each(me.lb_task_results,function(lbTask){
                    if(Ext.Array.contains(lbTask.get('_ItemHierarchy'),r.get('ObjectID'))){
                        totalEstimate += lbTask.get('Estimate') || 0; //Ext.Number.toFixed(totalEstimate,2)
                        totalToDo +=  lbTask.get('ToDo') || 0;
                        totalTimeSpent += me.taskTimeSpent[lbTask.get('ObjectID')] || 0;
                    }
                });

                Ext.Array.each(me.lb_wp_results,function(lbWp){
                    if(Ext.Array.contains(lbWp.get('_ItemHierarchy'),r.get('ObjectID'))){
                        totalTimeSpent += me.wpTimeSpent[lbWp.get('ObjectID')] || 0;
                    }
                });

                totalTimeSpent = isNaN(Ext.util.Format.round(totalTimeSpent,2)) ? 0 :  Ext.util.Format.round(totalTimeSpent,2);  
                totalDiff = isNaN(Ext.util.Format.round((totalEstimate - totalTimeSpent),2)) ? 0 :  Ext.util.Format.round((totalEstimate - totalTimeSpent),2);  

                r.set('Estimate', Ext.util.Format.round(totalEstimate,2));
                r.set('TimeSpent', Ext.util.Format.round(totalTimeSpent,2));
                r.set('ToDo', totalToDo);
                r.set('Diff', totalDiff);                
            //}

        });
        me.resumeLayouts();
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
            "fetch": [ "ObjectID","Estimate","TimeSpent","_ItemHierarchy","ToDo"],
            "find": find,
            "useHttpPost": true
            // ,
            // "removeUnauthorizedSnapshots":true
        });

        snapshotStore.load({
            callback: function(records, operation) {
                console.log('operation>>',operation);
                if(operation.wasSuccessful()){
                    deferred.resolve([piObjectIDs,records]);
                }else{
                    if(operation.error.status === 403) {
                        me.showErrorNotification('You do not have required permissions to access the data.');
                    }else{
                        me.showErrorNotification('Problem Loading');
                    }
                    me.setLoading(false);
                }
                
            },
            scope:me
        });
    
        return deferred;
    },

    _getWorkProductsFromSnapShotStore:function(piObjectIDs){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var find = {
                        "_TypeHierarchy": { "$in" : [ "HierarchicalRequirement", "Defect" ] },
                        "_ItemHierarchy": { $in: piObjectIDs }
                    };
        find["__At"] = "current";

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "fetch": [ "ObjectID","Estimate","TimeSpent","_ItemHierarchy","ToDo","Name"],
            "find": find,
            "useHttpPost": true
            // ,
            // "removeUnauthorizedSnapshots":true
        });

        snapshotStore.load({
            callback: function(records, operation) {
                console.log('operation>>',operation);
                if(operation.wasSuccessful()){
                    deferred.resolve([piObjectIDs,records]);
                }else{
                    if(operation.error.status === 403) {
                        me.showErrorNotification('You do not have required permissions to access the data.');
                    }else{
                        me.showErrorNotification('Problem Loading');
                    }
                    me.setLoading(false);
                }
                
            },
            scope:me
        });
    
        return deferred;
    },

    showErrorNotification: function(msg){
        Rally.ui.notify.Notifier.showError({message: msg});
    },

       
    _loadWsapiRecords: function(config){
        console.log('_loadWsapiRecords',config);
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

    _addTotals:function(grid) {
        var me = this;
        var filters = grid && grid.gridConfig.store.filters.items[0];
        var allPi;
        me.setLoading('Loading totals...');
            me._getSelectedPIs(me.selectedPILevel[0],filters).then({
                success: function(records){
                  
                    me.totalLeafStoryPlanEstimateTotal = 0;
                    me.totalAcceptedLeafStoryPlanEstimateTotal = 0;  
                    me.totalTaskEstimate = 0;
                    me.totalTaskTimeSpent = 0;
                    me.totalTaskToDo = 0;
                    me.totalDiff = 0;
                    Ext.Array.each(records,function(r){
                        if(r.get('_type') == "hierarchicalrequirement" && r.get('Parent') != null){
                            //r.parentNode.removeChild(r);
                        }else{                          
                            var totalEstimate = 0;
                            var totalTimeSpent = 0;
                            var totalToDo = 0;
                            if(me.selectedPILevel[0]=='hierarchicalrequirement'){
                                me.totalLeafStoryPlanEstimateTotal += r.get('PlanEstimate') || 0;
                                if(me.selectedPILevel[0]=='hierarchicalrequirement' && r.get('ScheduleState') == 'Accepted'){
                                    me.totalAcceptedLeafStoryPlanEstimateTotal += r.get('PlanEstimate') || 0;  
                                }
                            }else{
                                me.totalLeafStoryPlanEstimateTotal += r.get('LeafStoryPlanEstimateTotal') || 0;
                                me.totalAcceptedLeafStoryPlanEstimateTotal += r.get('AcceptedLeafStoryPlanEstimateTotal') || 0;                
                            }

                            Ext.Array.each(me.lb_task_results,function(lbTask){
                                if(Ext.Array.contains(lbTask.get('_ItemHierarchy'),r.get('ObjectID'))){
                                    totalEstimate += lbTask.get('Estimate') || 0; 
                                    totalToDo += lbTask.get('ToDo') || 0; 
                                    totalTimeSpent += me.taskTimeSpent[lbTask.get('ObjectID')] || 0;
                                }
                            });

                            Ext.Array.each(me.lb_wp_results,function(lbWp){
                                if(Ext.Array.contains(lbWp.get('_ItemHierarchy'),r.get('ObjectID'))){
                                    totalTimeSpent += me.wpTimeSpent[lbWp.get('ObjectID')] || 0;
                                }
                            });                        

                            me.totalTaskEstimate += totalEstimate || 0;
                            me.totalTaskTimeSpent += totalTimeSpent || 0;
                            me.totalTaskToDo += totalToDo || 0;
                        }

                    });

                    me.totalDiff = me.totalTaskEstimate - me.totalTaskTimeSpent;


                    me.down('#totals_box').removeAll();

                    Ext.create('Ext.data.Store', {
                        storeId:'totalStore',
                        fields:['TotalTaskEstimate', 'TotalTimeSpent','TotalDiff','TotalTaskToDo', 'LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal'],
                        data:{'items':[
                            { 'TotalTaskEstimate': Ext.Number.toFixed(me.totalTaskEstimate,2) +' Hours', 'TotalTimeSpent':Ext.Number.toFixed(me.totalTaskTimeSpent,2) +' Hours',  'TotalDiff': Ext.Number.toFixed(me.totalDiff,2) +' Hours', 'TotalTaskToDo': Ext.Number.toFixed(me.totalTaskToDo,2) +' Hours','LeafStoryPlanEstimateTotal':Ext.Number.toFixed(me.totalLeafStoryPlanEstimateTotal,0),'AcceptedLeafStoryPlanEstimateTotal':Ext.Number.toFixed(me.totalAcceptedLeafStoryPlanEstimateTotal,0) },
                        ]},
                        proxy: {
                            type: 'memory',
                            reader: {
                                type: 'json',
                                root: 'items'
                            }
                        }
                    });

                    me.down('#totals_box').add({
                        xtype: 'grid',
                        title: 'Totals',
                        header:{
                            style: {
                                background: 'grey',
                                'color': 'white',
                                'font-weight': 'bold'
                            }
                        },
                        store: Ext.data.StoreManager.lookup('totalStore'),
                        columns: [
                            { text: 'Total Task Estimate',  dataIndex: 'TotalTaskEstimate', flex:4},
                            { text: 'Total Time Spent', dataIndex: 'TotalTimeSpent', flex:4 },
                            { text: 'Diff (Estimate - TimeSpent)', dataIndex: 'TotalDiff', flex:5 },
                            { text: 'Total ToDo', dataIndex: 'TotalTaskToDo', flex:2 },
                            { text: 'Leaf Story PlanEstimate Total', dataIndex: 'LeafStoryPlanEstimateTotal' , flex:4},
                            { text: 'Accepted Leaf Story PlanEstimate Total', dataIndex: 'AcceptedLeafStoryPlanEstimateTotal' , flex:4}
                        ],
                        width:600
                    });
                    me.setLoading(false);
                },
                scope:me
            });

 
    },

    _addGrid: function (store) {

        var me = this;
        var context = me.getContext();
        store.on('load', me._updateAssociatedData, me);
        
        me.down('#display_box').removeAll();
        
        me.down('#display_box').add({
                  itemId: 'pigridboard',
                  xtype: 'rallygridboard',
                  context: context,
                  modelNames: me.selectedPILevel,
                  toggleState: 'grid',
                  stateful: false,
                  plugins: me._getPlugins(),
                  gridConfig: {
                    store: store,
                    enableEditing: false,
                    columnCfgs: me._getColumnCfgs(),
                    derivedColumns: me.getDerivedColumns(),
                    shouldShowRowActionsColumn:false,
                    enableRanking: false,
                    enableBulkEdit: false
                  },
                  listeners: {
                    load: me._addTotals,
                    scope: me
                  },
                  height: me.getHeight()
              });

        me.setLoading(false);
    },

    _getPlugins: function(){
        var me = this;
        models = me.selectedPILevel;

        var plugins = [
        {
                ptype: 'rallygridboardinlinefiltercontrol',
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: me.getContext().getScopedStateId('filters'),
                    modelNames: models,
                    inlineFilterPanelConfig: {
                        collapsed: false,
                        quickFilterPanelConfig: {
                            defaultFields: ['ArtifactSearch', 'Owner'],
                            addQuickFilterConfig: {
                                whiteListFields: ['Milestones', 'Tags']
                            }
                        },
                        advancedFilterPanelConfig: {
                            advancedFilterRowsConfig: {
                                propertyFieldConfig: {
                                    whiteListFields: ['Milestones', 'Tags']
                                }
                            }
                        }  
                    }                  
                },
                
        }   
        ];

        plugins.push({
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: models,
            stateful: true,
            gridAlwaysSelectedValues: ['Name','Owner','Estimate','TimeSpent','ToDo','LeafStoryPlanEstimateTotal','PlanEstimate','AcceptedLeafStoryPlanEstimateTotal'],
            stateId: me.getContext().getScopedStateId('field-picker')
        });

        plugins.push({
            ptype: 'rallygridboardactionsmenu',
            menuItems: [
                {
                    text: 'Export...',
                    handler: me._showExportMenu,
                    scope: me
                }
            ],
            buttonConfig: {
                iconCls: 'icon-export',
                margin: '15px 10px 0px 0px'
            }
        });

        return plugins;        
    },



    _showExportMenu: function(){
        var me = this;
        var grid = me.down('#pigridboard').getGridOrBoard();

        if ( !grid ) { return; }
        
        this.logger.log('_export',grid);

        var filename = Ext.String.format('portfolio-reporting.csv');

        var records = [];

        this.logger.log('Children',grid.getRootNode().childNodes);
        this.logger.log('grid.columns',grid.columns);

        me.setLoading("Generating CSV");

        var CSV = "";    
        var row = "";
        // Add the column headers
        var columns = [];
        Ext.Array.each(grid.columns,function(col){
            row += col.text.replace("ID"," ID ") + ',';
            columns.push(col.dataIndex);
        });

        CSV += row + '\r\n';

        _.each(grid.getRootNode().childNodes, function(record){
            row = "";
            _.each(grid.columns,function(col){
                if(col.dataIndex){
                    row += record.get(col.dataIndex) ? ( record.get(col.dataIndex)._refObjectName || record.get(col.dataIndex) ) + ',' : ',';
                }
            });
            row += record.get('Estimate') - record.get('TimeSpent') + ','
            CSV += row + '\r\n';
        });

        me.CSV = CSV;
        me.setLoading(false);
        var filename = Ext.String.format('portfolio-reporting.csv');

        Rally.technicalservices.FileUtilities.saveCSVToFile(me.CSV,filename);
    },


    _getColumnCfgs: function(){
        var me = this;

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
            text: 'Task Estimate'
        },
        {
            dataIndex: 'ToDo',
            text: 'To Do'
        },
        {
            dataIndex: 'TimeSpent',
            text: 'Task Time Spent'
        },
        {
            dataIndex: 'LeafStoryPlanEstimateTotal',
            text: 'LeafStory Plan Estimate Total'
        },
        {
            dataIndex: 'PlanEstimate',
            text: 'Plan Estimate'
        },
        {
            dataIndex: 'AcceptedLeafStoryPlanEstimateTotal',
            text: 'Accepted LeafStory Plan Estimate Total'
        }].concat(me.getDerivedColumns());
    },

    getDerivedColumns: function(){
        return [{
            tpl: '<div style="text-align:right;">{Diff}</div>',
            text: 'Diff (Estimate – Timespent)',
            xtype: 'templatecolumn'
        }];
    },

    fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');
        var store = Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            fetch: ['TypePath', 'Ordinal','Name'],
            filters: [
                {
                    property: 'Parent.Name',
                    operator: '=',
                    value: 'Portfolio Item'
                },
                {
                    property: 'Creatable',
                    operator: '=',
                    value: 'true'
                }
            ],
            sorters: [{
                property: 'Ordinal',
                direction: 'DESC'
            }]
        });
        store.load({
            callback: function(records, operation, success){
                if (success){
                    var portfolioItemTypes = [];
                    Ext.Array.each(records, function(d){
                        portfolioItemTypes.push({ typePath: d.get('TypePath'), name: d.get('Name') });
                    });
                    deferred.resolve(portfolioItemTypes);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error loading Portfolio Item Types:  ' + error_msg);
                }
            }
        });
        return deferred.promise;
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
