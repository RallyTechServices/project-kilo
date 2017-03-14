Ext.override(Rally.data.wsapi.TreeStore,{
    _decorateModels: function() {
        var models = this.model;

        if (_.isFunction(models.getArtifactComponentModels)) {
            models = models.getArtifactComponentModels();
        }

        Ext.Array.each(models, function(m){
            if (m.typePath.indexOf("portfolioitem/") != -1){
                m.addField({name: 'PlanEstimate', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'Estimate', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'TimeSpent', type: 'auto', defaultValue: null, modelType: m.typePath});
            }
            if (m.typePath.indexOf("hierarchicalrequirement") != -1){
                m.addField({name: 'Estimate', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'TimeSpent', type: 'auto', defaultValue: null, modelType: m.typePath});
            }            
        });

        _.each(Ext.Array.from(models), Rally.ui.grid.data.NodeInterface.decorate, Rally.ui.grid.data.NodeInterface);
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
    _getColumnConfigsBasedOnCurrentOrder: function(columnConfigs) {
        var cols = _(this.headerCt.items.getRange()).map(function(column) {
            //override:  Added additional search for column.text
            return _.contains(columnConfigs, column.dataIndex) ? column.dataIndex : _.find(columnConfigs, {xtype: column.xtype, text: column.text });
        }).compact().value();

        return cols;
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


Ext.override(Rally.data.wsapi.TreeStore, {
    _getChildNodeFilters: function(node) {
        var parentType = node.self.typePath,
            childTypes = this._getChildTypePaths([parentType]),
            parentFieldNames = this._getParentFieldNames(childTypes, parentType);
        //console.log('_getChildNodeFilters', node, this.childFilters, parentType);
        if (parentFieldNames.length) {
            var filters =  Rally.data.wsapi.Filter.or(_.map(parentFieldNames, function(parentFieldName) {
                return {
                    property: parentFieldName,
                    operator: '=',
                    value: node.get('_ref')
                };
            }));
            if (this.childFilters && this.childFilters[parentType]){
                return [filters.and(this.childFilters[parentType])];
            }
            return [filters];
        }
        return [];
    }
});

Ext.override(Rally.ui.grid.plugin.TreeGridChildPager, {
    _storeHasMoreChildPages: function(parentRecord) {
        var loadedCount = this._getLoadedCount(parentRecord);
        var childPageSize = this.cmp.getStore().getChildPageSize(parentRecord);
        return parentRecord.get('leafCount') > loadedCount && loadedCount >= childPageSize;
    }
});

Ext.override(Rally.ui.grid.TreeView, {
    _expandHandler: function(node, children){
        if (this.getTreeStore().getRootNode() !== node && children.length === 0){
            this.refresh(); //treegrid freaks out when it tries to expand a node that has no children, so force a refresh
            if (!this.getTreeStore().hasErrors()){
                Rally.ui.notify.Notifier.showWarning({message:node.get('FormattedID') + ' may have children that are not displayed due to the Feature Query Filter in the App Settings.'});
            }
        }
    },
});