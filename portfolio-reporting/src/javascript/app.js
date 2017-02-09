Ext.define("TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'message_box',layout:{type:'hbox'}},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "TSApp"
    },
    
    selectedPILevel: ['PortfolioItem/Initiative'],

    modelNames: ['PortfolioItem','HierarchicalRequirement','Task'],

    launch: function() {
        var me = this;
        console.log(me._getSelectedColumns());
        me.down('#message_box').add([{
                name: 'selectorType',
                itemId: 'selectorType',
                fieldLabel: 'Select PI: ',
                width: 250,
                margin: '10 10 10 10',                
                xtype: 'rallyportfolioitemtypecombobox',
                valueField: 'TypePath',
                readyEvent: 'ready',
                listeners: {
                    load: me._updateGrid,
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
                fieldBlackList: ['Attachments','Children']
            },
            {
                xtype: 'rallybutton',
                text: 'Update',
                margin: '10 10 10 10',
                cls: 'primary',
                listeners: {
                    click: me._updateGrid,
                    scope: me
                }
            }           
            ]);

            //me._updateGrid();
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

    _updateGrid: function(){
        var me = this;
        me.selectedPILevel = [me.down('#selectorType').getValue()];
        console.log(me.down('#selectorType').getValue());
        me.setLoading('Loading Grid...');
        Deft.Promise.all([me._getStories(),me._getPIs()],me).then({
            success: function(records){
                me.totalPlanEstimate = 0;
                me.totalTaskEstimate = 0;
                me.totalTaskTimeSpent = 0;
                me.totalAcceptedLeafStoryPlanEstimateTotal = 0;

                var task_filters = [];

                Ext.Array.each(records[0], function(story){
                    me.totalPlanEstimate += story.get('PlanEstimate');
                    task_filters.push({property:'WorkProduct.ObjectID',value:story.get('ObjectID')});
                });

                Ext.Array.each(records[1],function(pi){
                    me.totalAcceptedLeafStoryPlanEstimateTotal += pi.get('AcceptedLeafStoryPlanEstimateTotal');
                });

                me._getTasks(task_filters).then({
                    success: function(records){

                        Ext.Array.each(records, function(task){
                            me.totalTaskEstimate += task.get('Estimate');
                            me.totalTaskTimeSpent += task.get('TimeSpent') && task.get('TimeSpent') > 0 ? task.get('TimeSpent') : 0;
                        });

                        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
                            models: me.selectedPILevel,
                            autoLoad: true,
                            enableHierarchy: true,
                            limit:'Infinity'
                        }).then({
                            success: me._addGridBoard,
                            scope: me
                        });

                    },
                    scope: me
                });
            },
            scope:me
        });
    },

    _getPIs: function(){
        var me = this;
        var config = {
                        model : me.selectedPILevel[0],
                        fetch : ['ObjectID','AcceptedLeafStoryPlanEstimateTotal'],
                        limit:'Infinity',
                        compact:false
                    }
        return me._loadWsapiRecords(config);
    },

    _getStories: function(){
        var me = this;
        var config = {
                        model : 'HierarchicalRequirement',
                        fetch : ['ObjectID', 'PlanEstimate','Feature','Parent','AcceptedLeafStoryPlanEstimateTotal'],
                        filters : [{
                            property: 'Feature.Parent.Parent.ObjectID',
                            operator: '>',
                            value: 0
                        }
                        ],
                        limit:'Infinity',
                        compact:false
                    }
        return me._loadWsapiRecords(config);
    },

    _getTasks: function(task_filters){
        var me = this;
        var config = {
                        model : 'Task',
                        fetch : ['ObjectID', 'PlanEstimate','Feature','Parent','ObjectID','WorkProduct','Estimate','TimeSpent'],
                        filters : Rally.data.wsapi.Filter.or(task_filters),
                        limit:'Infinity',
                        compact:false,
                        enablePostGet:true
                    }
        return me._loadWsapiRecords(config);
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
    
    _displayGrid: function(store,field_names){
        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: field_names
        });
    },

    _addGridBoard: function (store) {
        var me = this;
        console.log('Tree store',store);

        console.log('columns ',me.getValue());
        me.down('#display_box').removeAll();
        me.down('#display_box').add({
            xtype: 'rallytreegrid',
            context: this.getContext(),
            store: store,
            enableSummaryRow:true,
            columnCfgs: me._getColumnCfgs(),
            height: this.getHeight(),
        });
        me.setLoading(false);
        //var me = this;

        // me.add({
        //     itemId: 'gridboard',
        //     xtype: 'rallygridboard',
        //     context: me.getContext(),
        //     toggleState: 'grid',
        //     stateful: true,
        //     modelNames: me.selectedPILevel,
        //     plugins: [
        //                     {
        //                         ptype: 'rallygridboardinlinefiltercontrol',
        //                         inlineFilterButtonConfig: {
        //                             modelNames: me.selectedPILevel,
        //                             inlineFilterPanelConfig: {
        //                                 quickFilterPanelConfig: {
        //                                     defaultFields: [
        //                                         'ArtifactSearch',
        //                                         'Owner',
        //                                         'ModelType'
        //                                     ]
        //                                 }
        //                             }
        //                         }
        //                     }
        //                 ],
        //     gridConfig: {
        //         enableSummaryRow: true,
        //         columnCfgs: me._getColumnCfgs(),
        //         store: store
        //     },
        //     height: me.getHeight()
        // });

    },

    _getGridBoardPlugins: function () {
        var me = this;
        var plugins = [{
                ptype: 'rallygridboardinlinefiltercontrol',
                inlineFilterButtonConfig: {
                    modelNames: me.selectedPILevel,
                    inlineFilterPanelConfig: {
                        collapsed: false,
                        quickFilterPanelConfig: {
                            fieldNames: ['Owner', 'ScheduleState']
                        }
                    }
                }
        }];

        // plugins.push({
        //     ptype: 'rallygridboardfieldpicker',
        //     headerPosition: 'left',
        //     modelNames: this.selectedPILevel,
        //     stateful: true,
        //     stateId: this.getContext().getScopedStateId('field-picker')
        // });

        return plugins;
    },

    _getColumnCfgs: function(){
        var me = this;
        console.log('rallyfieldcombobox>>',me.down('#message_box').query('rallyfieldpicker'));

        return  [{
            dataIndex: 'Name',
            text: 'Name'
        },{
            dataIndex: 'ScheduleState',
            text: 'Schedule State'
        },{
            dataIndex: 'Owner',
            text: 'Owner'
        }, {
            dataIndex: 'PlanEstimate',
            text: 'Plan Estimate <br/>' + '<b>' + me.totalPlanEstimate +'</b>',
            summaryType: 'sum',
            summaryRenderer: function() {
                return '<b>' + me.totalPlanEstimate +'</b>';
            }
        },{
            dataIndex: 'Estimate',
            text: 'Task Estimate',
            summaryType: 'sum',
            summaryRenderer: function() {
                return '<b>' + me.totalTaskEstimate +'</b>';
            }
        },{
            dataIndex: 'TimeSpent',
            text: 'Task Time Spent',
            summaryType: 'sum',
            summaryRenderer: function() {
                return '<b>' + me.totalTaskTimeSpent +'</b>';
            }
        },
        {
            dataIndex: 'AcceptedLeafStoryPlanEstimateTotal',
            text: 'Accepted LeafStory Plan Estimate Total',
            summaryType: 'sum',
            summaryRenderer: function() {
                return '<b>' + me.totalAcceptedLeafStoryPlanEstimateTotal +'</b>';
            }
        }];
    },

    _getSelectedColumns: function(){
        var me = this;
        var cols = [];
        Ext.Array.each(me._getColumnCfgs(),function(col){
            cols.push(col.dataIndex);
        });
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
