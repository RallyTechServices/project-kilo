Ext.define("CArABU.app.TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new CArABU.technicalservices.Logger(),
    defaults: { margin: 10 },
    estimateValues : [
                {"val":"LeafStoryPlanEstimateTotal", "name":"Leaf Story Plan Estimate"},
                {"val":"PreliminaryEstimateValue", "name":"Preliminary Estimate"},
                {"val":"RefinedEstimate", "name":"Refined Estimate"}
            ],
    integrationHeaders : {
        name : "CArABU.app.TSApp"
    },

    launch: function() {
        var me = this;
        console.log('Launching');
        Rally.ui.notify.Notifier.hide();
        Rally.data.util.PortfolioItemHelper.loadTypeOrDefault({
            defaultToLowest: true,
            requester: this,
            success: function (piTypeDef) {
                this.piTypePath = piTypeDef.get('TypePath');
                this.add({
                    xtype:'container',
                    html: 'Estimate Type: '+ _.find(me.estimateValues, { 'val': me.getSetting('estimateType')}).name 
                })
                this._buildGridBoard();
            },
            scope: this
        });
    },
    config: {
        defaultSettings: {
            estimateType : 'PreliminaryEstimateValue'
        }
    },

    _buildGridBoard: function () {
        var me = this;
        var context = this.getContext();

        this.gridboard = this.add({
            xtype: 'rallytimeboxgridboard',
            cardBoardConfig: {
                columnConfig: {
                    columnStatusConfig: {
                        pointField: me.getSetting('estimateType')
                    },
                    fields: this._getDefaultFields()
                },
                listeners: {
                    filter: this._onBoardFilter,
                    filtercomplete: this._onBoardFilterComplete,
                    scope: this
                }
            },
            context: context,
            endDateField: 'ReleaseDate',
            modelNames: this._getModelNames(),
            plugins: this._getPlugins(),
            startDateField: 'ReleaseStartDate',
            timeboxType: 'Release'
        });
    },
    _getDefaultFields: function() {
        return ['Discussion', 'PreliminaryEstimate', 'UserStories', 'Milestones'];
    },
    _getModelNames: function() {
        return [this.piTypePath];
    },
    _onBoardFilter: function() {
        this.setLoading(true);
    },

    _onBoardFilterComplete: function() {
        this.setLoading(false);
    },    
    _getPlugins: function () {
        var context = this.getContext(),
            boardFieldBlacklist = [
            ];

        return [
            {
                ptype: 'rallygridboardaddnew',
                rankScope: 'BACKLOG',
                addNewControlConfig: {
                    stateful: true,
                    stateId: context.getScopedStateId('release-planning-add-new')
                }
            },
            this._getCustomFilterControlPluginConfig(),            
            {
                ptype: 'rallygridboardfieldpicker',
                boardFieldBlackList: boardFieldBlacklist,
                headerPosition: 'left'
            },
            this._getSharedViewPluginConfig()
        ];
    },

    _getCustomFilterControlPluginConfig: function() {
        var context = this.getContext();
        var blackListFields = ['PortfolioItemType', 'Release', 'ModelType'];
        var whiteListFields = ['Milestones', 'Tags'];

        return {
            ptype: 'rallygridboardinlinefiltercontrol',
            inlineFilterButtonConfig: {
                stateful: true,
                stateId: context.getScopedStateId('release-planning-inline-filter'),
                legacyStateIds: [
                    context.getScopedStateId('release-planning-owner-filter'),
                    context.getScopedStateId('release-planning-custom-filter-button')
                ],
                filterChildren: false,
                modelNames: this._getModelNames(),
                inlineFilterPanelConfig: {
                    quickFilterPanelConfig: {
                        defaultFields: [
                            'ArtifactSearch',
                            'Owner',
                            'Parent'
                        ],
                        addQuickFilterConfig: {
                            blackListFields: blackListFields,
                            whiteListFields: whiteListFields
                        }
                    },
                    advancedFilterPanelConfig: {
                        advancedFilterRowsConfig: {
                            propertyFieldConfig: {
                                blackListFields: blackListFields,
                                whiteListFields: whiteListFields
                            }
                        }
                    }
                }
            }
        };
    },

    _getSharedViewPluginConfig: function () {
        var context = this.getContext();

        return {
            ptype: 'rallygridboardsharedviewcontrol',
            sharedViewConfig: {
                stateful: true,
                stateId: context.getScopedStateId('release-planning-shared-view'),
                defaultViews: _.map(this._getDefaultViews(), function(view) {
                    Ext.apply(view, {
                        Value: Ext.JSON.encode(view.Value, true)
                    });
                    return view;
                }, this),
                enableUrlSharing: this.isFullPageApp !== false
            }
        };
    },
    _getDefaultViews: function() {
        return [
            {
                Name: 'Default View',
                identifier: 1,
                Value: {
                    toggleState: 'board',
                    fields: this._getDefaultFields()
                }
            }
        ];
    },
    _displayGridGivenStore: function(store,field_names){
        this.down('#grid_box1').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: field_names
        });
    },

    _displayGridGivenRecords: function(records,field_names){
        var store = Ext.create('Rally.data.custom.Store',{
            data: records
        });

        var cols = Ext.Array.map(field_names, function(name){
            return { dataIndex: name, text: name, flex: 1 };
        });
        this.down('#grid_box2').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: cols
        });
    },

    getSettingsFields: function() {
        var me = this;
        var estimates = Ext.create('Ext.data.Store', {
            fields: ['val', 'name'],
            data : me.estimateValues
        });

        var check_box_margins = '5 0 5 0';
        return [
        {
            name: 'estimateType',
            xtype:'combobox',
            fieldLabel: 'Choose Estimate Type',
            store: estimates,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'val',
            width:400,
            labelWidth: 200,
            margin: check_box_margins
        },
        {
            name: 'saveLog',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: check_box_margins,
            boxLabel: 'Save Logging<br/><span style="color:#999999;"><i>Save last 100 lines of log for debugging.</i></span>'

        }];
    },

    getOptions: function() {
        var options = [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];

        return options;
    },

    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }

        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{
            showLog: this.getSetting('saveLog'),
            logger: this.logger
        });
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }

});
