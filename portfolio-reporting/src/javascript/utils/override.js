Ext.override(Rally.data.wsapi.TreeStore,{
    _decorateModels: function() {
        var models = this.model;

        if (_.isFunction(models.getArtifactComponentModels)) {
            models = models.getArtifactComponentModels();
        }

        Ext.Array.each(models, function(m){
            m.addField({name: 'Diff', type: 'auto',  defaultValue: 0});

            if (m.typePath.indexOf("portfolioitem/") != -1){
                //m.addField({name: 'PlanEstimate', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'Estimate', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'TimeSpent', type: 'auto', defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'ToDo', type: 'auto',  defaultValue: 0, modelType: m.typePath});
            }
            if (m.typePath.indexOf("hierarchicalrequirement") != -1){
                m.addField({name: 'Estimate', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'TimeSpent', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'ToDo', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'AcceptedLeafStoryPlanEstimateTotal', type: 'auto', defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'LeafStoryPlanEstimateTotal', type: 'auto',defaultValue: 0, modelType: m.typePath});
            }
            if (m.typePath.indexOf("defect") != -1){
                m.addField({name: 'Estimate', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'TimeSpent', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'ToDo', type: 'auto',  defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'AcceptedLeafStoryPlanEstimateTotal', type: 'auto', defaultValue: 0, modelType: m.typePath});
                m.addField({name: 'LeafStoryPlanEstimateTotal', type: 'auto',defaultValue: 0, modelType: m.typePath});
            }                            
        });

        _.each(Ext.Array.from(models), Rally.ui.grid.data.NodeInterface.decorate, Rally.ui.grid.data.NodeInterface);
    }
});

Ext.override(Rally.ui.renderer.template.ScheduleStateTemplate, {
    _getSymbolState: function(recordData, state) {
        var symbolState;
        if (recordData.ScheduleStatePrefix) {
            //
            // if (!recordData.isDirty || this._isCreate(recordData)) {
            //      symbolState = recordData.ScheduleStatePrefix;
            // }  else {
            //     symbolState = '';
            // }
            // overriding this as the record gets dirty after adding the task estimate to UserStory and PortfolioItems
            
            symbolState = recordData.ScheduleStatePrefix;
            
        } else {
            symbolState = state === 'In-Progress' ? 'P' : state.charAt(0);
        }
        return symbolState;
    }
});

Ext.override(Rally.ui.grid.TreeGrid, {
    _mergeColumnConfigs: function(newColumns, oldColumns) {

        var mergedColumns= _.map(newColumns, function(newColumn) {
            var oldColumn = _.find(oldColumns, {dataIndex: this._getColumnName(newColumn)});
            if (oldColumn) {
                return this._getColumnConfigFromColumn(oldColumn);
            }

            return newColumn;
        }, this);
        mergedColumns = mergedColumns.concat(this.config.derivedColumns);
        return mergedColumns;
    },
    _restoreColumnOrder: function(columnConfigs) {

        var currentColumns = this._getColumnConfigsBasedOnCurrentOrder(columnConfigs);
        var addedColumns = _.filter(columnConfigs, function(config) {
            return !_.find(currentColumns, {dataIndex: config.dataIndex}) || Ext.isString(config);
        });

        return currentColumns.concat(addedColumns);
    },
    _applyStatefulColumns: function(columns) {
        if (this.alwaysShowDefaultColumns) {
            _.each(this.columnCfgs, function(columnCfg) {
                if (!_.any(columns, {dataIndex: this._getColumnName(columnCfg)})) {
                    columns.push(columnCfg);
                }
            }, this);
        }
        if (this.config && this.config.derivedColumns){
            this.columnCfgs = columns.concat(this.config.derivedColumns);
        } else {
            this.columnCfgs = columns;
        }
    }
});

/* Opening all links in new window as per customer request. */
Ext.override(Rally.nav.DetailLink, {

        getLink: function(options) {
            var data = options.record.isModel ? options.record.data : options.record;
            var target =  Rally.util.Window.isInFrame() ? '_top' : '';
            var hover = '';

            var href = Rally.nav.Manager.getDetailUrl(data, options);

            if(!href){
                return options.text;
            }

            var showHover = options.showHover !== false && window.activateEl;
            if(showHover){
                hover = this._getHoverText(data._ref);
            }

            var oid = Rally.util.Ref.getOidFromRef(data._ref);

            return this.template.apply({
                href: href,
                target: '_blank',
                onclick: options.onclick,
                text: options.text,
                hover: hover,
                tooltip: options.showTooltip !== false,
                id: showHover? 'hov' + oid : ''
            });

        }

});