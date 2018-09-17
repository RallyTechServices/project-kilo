Ext.override(Ext.grid.feature.Grouping, {

    setupRowData: function(record, idx, rowValues) {
        var me = this,
            data = me.refreshData,
            groupInfo = me.groupInfo,
            header = data.header,
            groupField = data.groupField,
            dataSource = me.view.dataSource,
            grouper, groupName, prev, next;

        rowValues.isCollapsedGroup = false;
        rowValues.summaryRecord = null;

        if (data.doGrouping) {
            grouper = me.view.store.groupers.first();

            // This is a placeholder record which represents a whole collapsed group
            // It is a special case.
            if (record.children) {
                groupName = grouper.getGroupString(record.children[0]);

                rowValues.isFirstRow = rowValues.isLastRow = true;
                rowValues.itemClasses.push(me.hdCollapsedCls);
                rowValues.isCollapsedGroup = rowValues.needsWrap = true;
                rowValues.groupInfo = groupInfo;
                groupInfo.groupField = groupField;
                groupInfo.name = groupName;
                groupInfo.groupValue = record.children[0].get(groupField);
                groupInfo.columnName = header ? header.text : groupField;
                rowValues.collapsibleCls = me.collapsible ? me.collapsibleCls : me.hdNotCollapsibleCls;
                rowValues.groupId = me.createGroupId(groupName);
                groupInfo.rows = groupInfo.children = record.children;
                if (me.showSummaryRow) {
                    rowValues.summaryRecord = data.summaryData[groupName];
                }
                return;
            }

            groupName = grouper.getGroupString(record);

            // If caused by an update event on the first or last records of a group fired by a GroupStore, the record's group will be attached.
            if (record.group) {
                rowValues.isFirstRow = record === record.group.children[0];
                rowValues.isLastRow  = record === record.group.children[record.group.children.length - 1];
            }

            else {
                // See if the current record is the last in the group
                rowValues.isFirstRow = idx === 0;
                if (!rowValues.isFirstRow) {
                    prev = dataSource.getAt(idx - 1);
                    // If the previous row is of a different group, then we're at the first for a new group
                    if (prev) {
                        // Must use Model's comparison because Date objects are never equal
                        rowValues.isFirstRow = !prev.isEqual(grouper.getGroupString(prev), groupName);
                    }
                }

                // See if the current record is the last in the group
                rowValues.isLastRow = idx == dataSource.getTotalCount() - 1;
                if (!rowValues.isLastRow) {
                    next = dataSource.getAt(idx + 1);
                    if (next) {
                        // Must use Model's comparison because Date objects are never equal
                        rowValues.isLastRow = !next.isEqual(grouper.getGroupString(next), groupName);
                    }
                }
            }

            if (rowValues.isFirstRow) {
                groupInfo.groupField = groupField;
                groupInfo.name = groupName;
                groupInfo.groupValue = record.get(groupField);
                groupInfo.columnName = header ? header.text : groupField;
                rowValues.collapsibleCls = me.collapsible ? me.collapsibleCls : me.hdNotCollapsibleCls;
                rowValues.groupId = me.createGroupId(groupName);

                if (!me.isExpanded(groupName)) {
                    rowValues.itemClasses.push(me.hdCollapsedCls);
                    rowValues.isCollapsedGroup = true;
                }

                // We only get passed a GroupStore if the store is not buffered
                if (dataSource.buffered) {
                    groupInfo.rows = groupInfo.children = [];
                } else {
                    groupInfo.rows = groupInfo.children = me.getRecordGroup(record).children;
                }
                rowValues.groupInfo = groupInfo;
            }

            if (rowValues.isLastRow) {
                // Add the group's summary record to the last record in the group
                if (me.showSummaryRow) {
                    rowValues.summaryRecord = data.summaryData[groupName];
                }
            }
            rowValues.needsWrap = (rowValues.isFirstRow || rowValues.summaryRecord);
        }
    },

    setup: function(rows, rowValues) {
        var me = this,
            data = me.refreshData,
            isGrouping = !me.disabled && me.view.store.isGrouped();
            
        me.skippedRows = 0;
        if (rowValues.view.bufferedRenderer) {
            rowValues.view.bufferedRenderer.variableRowHeight = true;
        }
        data.groupField = me.getGroupField();
        data.header = me.getGroupedHeader(data.groupField);
        data.doGrouping = isGrouping;
        rowValues.groupHeaderTpl = Ext.XTemplate.getTpl(me, 'groupHeaderTpl');

        if (isGrouping && me.showSummaryRow) {
            data.summaryData = me.generateSummaryData();
        }
    },    

    generateSummaryData: function(){
        var me = this,
            store = me.view.store,
            groups = store.groups.items,
            reader = store.proxy.reader,
            len = groups.length,
            groupField = me.getGroupField(),
            data = {},
            lockingPartner = me.lockingPartner,
            i, group, record,
            root, summaryRows, hasRemote,
            convertedSummaryRow, remoteData;

        /**
         * @cfg {String} [remoteRoot=undefined]
         * The name of the property which contains the Array of summary objects.
         * It allows to use server-side calculated summaries.
         */
        if (me.remoteRoot && reader.rawData) {
            hasRemote = true;
            remoteData = {};
            // reset reader root and rebuild extractors to extract summaries data
            root = reader.root;
            reader.root = me.remoteRoot;
            reader.buildExtractors(true);
            summaryRows = reader.getRoot(reader.rawData)||[];
            len = summaryRows.length;

            // Ensure the Reader has a data conversion function to convert a raw data row into a Record data hash
            if (!reader.convertRecordData) {
                reader.buildExtractors();
            }

            for (i = 0; i < len; ++i) {
                convertedSummaryRow = {};

                // Convert a raw data row into a Record's hash object using the Reader
                reader.convertRecordData(convertedSummaryRow, summaryRows[i]);
                remoteData[convertedSummaryRow[groupField]] = convertedSummaryRow;
            }

            // restore initial reader configuration
            reader.root = root;
            reader.buildExtractors(true);
        }

        for (i = 0; i < len; ++i) {
            group = groups[i];
            // Something has changed or it doesn't exist, populate it
            if (hasRemote || group.isDirty() || !group.hasAggregate()) {
                if (hasRemote) {
                    record = me.populateRemoteRecord(group, remoteData);
                } else {
                    record = me.populateRecord(group);
                }
                // Clear the dirty state of the group if this is the only Summary, or this is the right hand (normal grid's) summary
                if (!lockingPartner || (me.view.ownerCt === me.view.ownerCt.ownerLockable.normalGrid)) {
                    group.commit();
                }
            } else {
                record = group.getAggregateRecord();
            }
            data[group.key] = record;
        }

        return data;
    }

});

Ext.override(Ext.grid.GridPanel, {
    applyState: function(state) {
        var me = this;
        me.callParent(arguments);
        if(state && state.storeState && state.storeState.groupers){
            this.store.group(state.storeState.groupers);
        }
    }
});

Ext.override(Ext.util.Filter, {
    operatorFns: {
        "<": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property], this.value) < this.value;
        },
        "<=": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property], this.value) <= this.value;
        },
        "=": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property] && this.getRoot(candidate)[this.property].toLowerCase(), this.value.toLowerCase()) == this.value.toLowerCase();
        },
        ">=": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property], this.value) >= this.value;
        },
        ">": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property], this.value) > this.value;
        },
        "!=": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property] && this.getRoot(candidate)[this.property].toLowerCase(), this.value.toLowerCase()) != this.value.toLowerCase();
        },
        "contains": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property] && this.getRoot(candidate)[this.property].toLowerCase(), this.value.toLowerCase()).indexOf(this.value.toLowerCase()) !== -1;
        },
        "!contains": function(candidate) {
            return Ext.coerce(this.getRoot(candidate)[this.property] && this.getRoot(candidate)[this.property].toLowerCase(), this.value.toLowerCase()).indexOf(this.value.toLowerCase()) == -1;
        }
    }

});