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
        //console.log('in launch');
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


    _getSelectedPIs: function(selectedPI){
        var me = this;
        var config = {
                        model : selectedPI,
                        fetch : ['ObjectID','AcceptedLeafStoryPlanEstimateTotal','LeafStoryPlanEstimateTotal'],
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


    updateView: function(){
        var me = this;

        if(!me.down('#selectorType')) return;

        me.selectedPILevel = [me.down('#selectorType').value];
        var pi_object_ids = [];

        me.setLoading(true);
        me._getSelectedPIs(me.selectedPILevel[0]).then({
            success: function(records){
                // console.log('_getSelectedPIs>>',records);
                Ext.Array.each(records,function(pi){
                    pi_object_ids.push(pi.get('ObjectID'));
                });

                me._getTasksFromSnapShotStore(pi_object_ids).then({
                    success: function(results){
                        // console.log('all taks from snapshot store',results);
                        me.totalTaskEstimate = 0;
                        me.lb_task_results = results[1];
                        var task_filter = [];
                        Ext.Array.each(results[1], function(task){
                            task_filter.push({property:'WorkProduct.ObjectID',value:task.get('_ItemHierarchy')[task.get('_ItemHierarchy').length - 2]});
                        });


                        me._getTasks(task_filter).then({
                            success: function(records){
                                // console.log('_getTasks>>',records);
                                me.totalTaskTimeSpent = 0;
                                me.taskTimeSpent = {}
                                Ext.Array.each(records,function(task){
                                    me.taskTimeSpent[task.get('ObjectID')] = task.get('TimeSpent') || 0;
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
        // console.log('_updateAssociatedData',records);
        me.totalLeafStoryPlanEstimateTotal = 0;
        me.totalAcceptedLeafStoryPlanEstimateTotal = 0;  
        me.totalTaskEstimate = 0;
        me.totalTaskTimeSpent = 0;

        Ext.Array.each(records,function(r){

            var totalEstimate = 0;
            var totalTimeSpent = 0;
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
                    totalEstimate += lbTask.get('Estimate') || 0; //Ext.Number.toFixed(totalEstimate,2)
                    totalTimeSpent += me.taskTimeSpent[lbTask.get('ObjectID')];
                }
            });

            r.set('Estimate',Ext.Number.toFixed(totalEstimate,2));
            r.set('TimeSpent',Ext.Number.toFixed(totalTimeSpent,2));

            me.totalTaskEstimate += totalEstimate || 0;
            me.totalTaskTimeSpent += totalTimeSpent || 0;
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

    _addTotals:function() {
        var me = this;
        
        me.down('#totals_box').removeAll();

        Ext.create('Ext.data.Store', {
            storeId:'totalStore',
            fields:['TotalTaskEstimate', 'TotalTimeSpent', 'LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal'],
            data:{'items':[
                { 'TotalTaskEstimate': Ext.Number.toFixed(me.totalTaskEstimate,2) +' Hours',  'TotalTimeSpent':Ext.Number.toFixed(me.totalTaskTimeSpent,2) +' Hours','LeafStoryPlanEstimateTotal':Ext.Number.toFixed(me.totalLeafStoryPlanEstimateTotal,0),'AcceptedLeafStoryPlanEstimateTotal':Ext.Number.toFixed(me.totalAcceptedLeafStoryPlanEstimateTotal,0) },
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
                { text: 'Total Task Estimate',  dataIndex: 'TotalTaskEstimate', flex:2},
                { text: 'Total Time Spent', dataIndex: 'TotalTimeSpent', flex:2 },
                { text: 'Leaf Story PlanEstimate Total', dataIndex: 'LeafStoryPlanEstimateTotal' , flex:2},
                { text: 'Accepted Leaf Story PlanEstimate Total', dataIndex: 'AcceptedLeafStoryPlanEstimateTotal' , flex:2}
            ],
            width:600
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
                  //store: store,
                  gridConfig: {
                    store: store,
                    enableEditing: false,
                    columnCfgs: me._getColumnCfgs()
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
                            defaultFields: ['ArtifactSearch', 'Owner']
                        }
                    }
                }
        }
        ];

        plugins.push({
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: models,
            stateful: true,
            gridAlwaysSelectedValues: ['Name','ScheduleState','Owner','Estimate','TimeSpent','LeafStoryPlanEstimateTotal','PlanEstimate','AcceptedLeafStoryPlanEstimateTotal'],
            stateId: me.getContext().getScopedStateId('field-picker')
        });

        return plugins;        
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
