var app = null;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    stateful: true,
    id: 'app',
    cache: [],
    items: [{
        id: 'panel',
        xtype: 'panel',
        layout: 'column',
        items: [{
            name: 'intervalType',
            xtype: 'combo',
            store: Ext.create("Ext.data.ArrayStore", {
                fields: ['interval'],
                data: [
                    ['Today'],
                    ['This Week'],
                    ['Last Week'],
                    ['This Month'],
                    ['Last Month']
                ]
            }),
            valueField: 'interval',
            displayField: 'interval',
            queryMode: 'local',
            forceSelection: true,
            boxLabelAlign: 'after',
            fieldLabel: 'Interval',
            margin: '5 5 5 5',
            listeners: {
                scope: this,
                select: function(list, item) {
                    var startDateCmp = Ext.getCmp('startDate');
                    var endDateCmp = Ext.getCmp('endDate');
                    var start, end;

                    var dt = new Date();

                    switch (_.first(item).get('interval')) {
                        case 'Today':
                            start = Ext.Date.clearTime(dt);
                            end = Ext.Date.clearTime(Ext.Date.add(start, Ext.Date.MILLI, ((24 * 60 * 60 * 1000) - 1)));
                            break;
                        case 'This Week':
                            start = Ext.Date.clearTime(Ext.Date.subtract(dt, Ext.Date.DAY, (dt.getDay()-1))); //Monday AM - WAS:Sunday AM
                            end = Ext.Date.clearTime(Ext.Date.add(start, Ext.Date.MILLI, ((7 * 24 * 60 * 60 * 1000) - 1))); //Saturday PM
                            break;
                        case 'Last Week':
                            start = Ext.Date.clearTime(Ext.Date.subtract(dt, Ext.Date.DAY, 6 + dt.getDay())); //Monday AM - WAS:Sunday AM
                            end = Ext.Date.clearTime(Ext.Date.add(start, Ext.Date.MILLI, ((7 * 24 * 60 * 60 * 1000) - 1))); //Saturday PM
                            break;
                        case 'This Month':
                            start = new Date("1/" + dt.getMonth() + 1 + "/" + dt.getFullYear());
                            end = Ext.Date.subtract(Ext.Date.add(start, Ext.Date.MONTH, 1), Ext.Date.MILLI, 1);
                            break;
                        case 'Last Month':
                            start = new Date("1/" + dt.getMonth() + 1 + "/" + dt.getFullYear());
                            start = Ext.Date.subtract(start, Ext.Date.MONTH, 1);
                            end = Ext.Date.subtract(Ext.Date.add(start, Ext.Date.MONTH, 1), Ext.Date.MILLI, 1);
                            break;
                    }

                    startDateCmp.setValue(start);
                    startDateCmp.getValue();
                    endDateCmp.setValue(end);
                    endDateCmp.getValue();
                    app.createTimeValueStore();
                }
            }
        }, {
            id: 'startDate',
            margin: '5 5 5 5',
            xtype: 'datefield',
            format: 'd M Y',
            stateful: true,
            stateId: 'tsDate1',
            fieldLabel: 'Start Date',
            value: new Date(),
            listeners: {
                select: function(field, value) {
                    var endDateCmp = Ext.getCmp('endDate');
                    if (endDateCmp.getValue() < value) {
                        endDateCmp.setValue(value);
                    }
                    app.createTimeValueStore();
                }
            }
        }, {
            id: 'endDate',
            margin: '5 5 5 5',
            xtype: 'datefield',
            stateful: true,
            stateId: 'tsDate2',
            format: 'd M Y',
            fieldLabel: 'End Date',
            value: new Date(),
            listeners: {
                select: function(field, value) {
                    var startDateCmp = Ext.getCmp('startDate');
                    if (startDateCmp.getValue() > value) {
                        startDateCmp.setValue(value);
                    }
                    app.createTimeValueStore();
                }
            }
        }, {
            id: 'exportButton',
            margin: '5 5 5 5',
            xtype: 'rallybutton',
            text: 'Export',
            handler: function() {
                var saveDialog = Ext.create('Rally.ui.dialog.Dialog', {
                    autoShow: true,
                    draggable: true,
                    width: 300,
                    title: 'Export all records',
                    items: [{
                            xtype: 'rallybutton',
                            text: 'CSV',
                            handler: function() {
                                app.exporter.exportCSV(app.grid);
                                saveDialog.destroy();
                            }
                        }, {
                            xtype: 'rallybutton',
                            text: 'SAP XML',
                            handler: function() {
                                app.exporter.exportSAPXML(app.grid);
                                saveDialog.destroy();
                            }
                        },

                        {
                            xtype: 'rallybutton',
                            text: 'Cancel',
                            handler: function() {
                                Ext.destroy(saveDialog);
                            },
                            flex: 1
                        }
                    ]

                });
            }
        }]
    }],

    launch: function() {

        app = this;

        this._onLoad();
    },

    _onLoad: function() {

        app._loadAStoreWithAPromise(
                'TypeDefinition',
                true, [{
                    property: "Ordinal",
                    operator: "!=",
                    value: -1
                }])
            .then({
                success: function(records) {
                    app.piTypes = records;
                    console.log("pitypes:", records);
                    app.exporter = Ext.create("GridExporter");
                    app.createTimeValueStore();
                }
            });
    },

    createTimeValueStore: function() {

        app.showMask("Loading Time Sheet Values");

        // clear the grid
        if (!_.isNull(app.grid)) {
            app.remove(app.grid);
        }

        var nr = null;
        if ((nr = Ext.getCmp('noRecords'))) {
            nr.destroy();
        }

        var filter = app._getDateFilter();

        // exclude zero value items
        filter.push({
            property: 'Hours',
            operator: '>',
            value: 0
        });

        //console.log(filter);

        Ext.create('Rally.data.wsapi.Store', {
            model: "TimeEntryValue",
            fetch: true,
            filters: filter,
            limit: 'Infinity'
        }).load({
            callback: function(records, operation, successful) {
                if (records.length === 0) {
                    app.hideMask();
                    app.add({
                        html: "No records for this date range",
                        itemId: "norecords",
                        id: "noRecords"
                    });
                }
                app.readRelatedValues(records,
                    function() {
                        app.hideMask();
                        var message = app.down("#norecords");
                        if (!_.isUndefined(message)) {
                            app.remove(message);
                        }
                        console.log('records', records);
                        app.createArrayStoreFromRecords(records);
                    }
                );
            }
        });
    },

    getFieldValue: function(record, field) {
        // returns the most specific value for a field
        // ie. Task -> Story -> Feature -> Epic
        var hasValue = function(value) {
            return !_.isUndefined(value) && !_.isNull(value) && value !== "";
        };
        var object = _.find(record.get("Hierarchy"), function(h) {
            return hasValue(h.get(field));
        });

        return (!_.isUndefined(object) && !_.isNull(object) ? object.get(field) : null);
    },

    getTypeFieldValue: function(record, type, field) {

        var object = _.find(record.get("Hierarchy"), function(h) {
            return h.get("_type") === type.get("TypePath").toLowerCase();
        });

        return (!_.isUndefined(object) && !_.isNull(object) ? object.get(field) : "");
    },

    createArrayStoreFromRecords: function(records) {

        var fields = [{
            displayName: 'User',
            name: 'UserName'
        }, {
            displayName: 'Task',
            name: 'TaskDisplayString'
        }, {
            displayName: 'Project',
            name: 'ProjectDisplayString'
        }, {
            displayName: 'Work Product',
            name: 'WorkProductDisplayString'
        }, {
            displayName: 'Feature ID',
            name: 'FeatureID'
        }, {
            displayName: 'Feature Title',
            name: 'FeatureName'
        }, {
            displayName: 'SAP Network',
            name: 'c_SAPNetwork'
        }, {
            displayName: 'SAP Operation',
            name: 'c_SAPOperation'
        }, {
            displayName: 'SAP Sub Operation',
            name: 'c_SAPSubOperation'
        }, {
            displayName: 'Epic ID',
            name: 'EpicID'
        }, {
            displayName: 'Epic Title',
            name: 'EpicName'
        }, {
            displayName: 'Hours Entered',
            name: 'Hours'
        }, {
            displayName: 'Unique ID',
            name: 'ObjectID'
        }, {
            displayName: 'Date',
            name: 'Date'
        }, {
            displayName: 'Employee ID',
            name: 'c_KMDEmployeeID'
        }, {
            displayName: 'Hierarchy',
            name: 'Hierarchy'
        }];

        // convert records into a json data structure
        var data = _.map(records, function(r) {
            
            return {
                "UserName": r.get("UserObject").get("UserName"),
                "TaskDisplayString": r.get("TimeEntryItemObject").get("TaskDisplayString"),
                "ProjectDisplayString": r.get("TimeEntryItemObject").get("ProjectDisplayString"),
                "WorkProductDisplayString": r.get("TimeEntryItemObject").get("WorkProductDisplayString"),
                "FeatureID": app.getTypeFieldValue(r, app.piTypes[0], "FormattedID"),
                "FeatureName": app.getTypeFieldValue(r, app.piTypes[0], "Name"),
                'c_SAPNetwork': app.getFieldValue(r, 'c_SAPNetwork'),
                'c_SAPOperation': app.getFieldValue(r, 'c_SAPOperation'),
                'c_SAPSubOperation': app.getFieldValue(r, 'c_SAPSubOperation'),
                'EpicID': app.getTypeFieldValue(r, app.piTypes[1], "FormattedID"),
                'EpicName': app.getTypeFieldValue(r, app.piTypes[1], "Name"),
                'Hours': r.get('Hours'),
                'ObjectID': r.get("ObjectID"),
                'Date': Ext.Date.format(r.get("DateVal"), "Ymd"),
                'c_KMDEmployeeID': r.get("UserObject").get("c_KMDEmployeeID"),
                'Hierarchy': r.get("Hierarchy")
            };
        });

        var store = Ext.create('Ext.data.JsonStore', {
            fields: fields,
            data: data
        });

        app.grid = new Ext.grid.GridPanel({
            header: false,
            id: 'tsGrid',
            title: 'TimeSheetData',
            features: [{
                ftype: 'grouping',
                showSummaryRow: true,
                groupHeaderTpl: ' {name}'
            }, {
                ftype: 'summary'
            }],
            store: store,
            columns: _.map(fields, function(f) {
                if (f.name === 'Hours') {
                    return {
                        text: f.displayName,
                        dataIndex: f.name,
                        summaryType: 'sum',
                        summaryRenderer: function(value, summaryData, dataIndex) {
                            return Ext.String.format('<div style="background-color:#E4EECF">Total: {0}</div>', value);
                        }
                    };
                } else if (f.name === 'UserName') {
                    return {
                        text: f.displayName,
                        dataIndex: f.name,
                        flex: 1,
                        summaryType: 'count',
                        summaryRenderer: function(value, summaryData, dataIndex) {
                            return Ext.String.format('<div style="background-color:#E4EECF"> {0} item{1}</div>', value, value > 1 ? 's' : '');
                        }
                    };
                } else if (f.name === 'TaskDisplayString' ||
                    f.name === 'WorkProductDisplayString' ||
                    f.name === "FeatureID" ||
                    f.name === "EpicID") {
                    return {
                        text: f.displayName,
                        dataIndex: f.name,
                        renderer: function(value, metaData, record, rowIdx, colIdx, store, view) {

                            return app.renderLink(value, record);
                        }
                    };
                } else if (f.name === 'Hierarchy') {
                    return {
                        text: f.displayName,
                        dataIndex: f.name,
                        visible: false,
                        hidden: true
                    };
                } else
                    return {
                        text: f.displayName,
                        dataIndex: f.name
                    };
            })
        });

        this.add(app.grid);


    },

    // creates a url link for the column based on the formatted id in the column
    renderLink: function(textValue, record) {
        
        var fid = _.first(textValue.split(":"));
        
        var obj = _.find(record.get("Hierarchy"), function(hObj) {
            return fid === hObj.get("FormattedID");
        });
        if (!_.isUndefined(obj) && !_.isNull(obj)) {
            return '<a href=' + Rally.nav.Manager.getDetailUrl(obj) + '>' + textValue + '</a>';
        }
        return textValue;
    },

    readRelatedValues: function(values, callback) {
        // time entry items
        app.readTimeEntryItems(values).then({

            success: function(items) {
                app.setValues(values, items, "TimeEntryItemObject");
                // users
                app.readUsers(items).then({
                    success: function(users) {
                        app.setValues(values, users, "UserObject");
                        // read work item hierarchies
                        app.readHierarchies(items).then({
                            success: function(hierarchies) {

                                app.setValues(values, hierarchies, "Hierarchy");
                                callback();
                            }
                        });
                    }
                });
            }
        });
    },

    readHierarchies: function(items) {

        var deferred = Ext.create('Deft.Deferred');
        // read task or workproduct, depending on timeentryitem type
        var p = _.map(items, function(item) {
            var obj = (!_.isUndefined(item.get("Task")) &&
                    !_.isNull(item.get("Task"))) ?
                item.get("Task") : item.get("WorkProduct");
            // return app.readObject(obj._type,obj);
            return app.readObject(obj);
        });

        Deft.Promise.all(p).then({
            success: function(values) {
                // get parent hierarchy
                var p2 = _.map(values, function(value) {
                    return app.recurseUpObject(value);
                });
                Deft.Promise.all(p2).then({
                    success: function(hierarchies) {
                        deferred.resolve(hierarchies);
                    }
                });
            }
        });
        return deferred.promise;
    },

    setValues: function(items, values, attrName) {
        _.each(items, function(item, x) {
            item.set(attrName, values[x]);
        });
    },

    // TimesheetEntryItems -> Stories -> Features -> Epics

    // readObject : function(model,ref) {
    readObject: function(object) {

        var deferred = Ext.create('Deft.Deferred');

        if (_.isNull(object)) {
            deferred.resolve(null);
        } else {
            var obj = _.find(app.cache, function(cacheObj) {
                if (cacheObj.object._ref === object._ref) {
                    return cacheObj.promise.promise;
                }
            });

            if (!_.isUndefined(obj) && !_.isNull(obj)) {
                return obj.promise.promise;
            } else {
                Rally.data.ModelFactory.getModel({
                    type: object._type,
                    success: function(model) {
                        model.load(object, {
                            fetch: true,
                            callback: function(result, operation) {
                                
                                deferred.resolve(result);
                            }
                        });
                    }
                });
                app.cache.push({
                    object: object,
                    promise: deferred
                });
                return deferred.promise;
            }
        }
    },

    // given an object, it will read all parent items based on type and return in a list
    recurseUpObject: function(obj) {

        var deferred = Ext.create('Deft.Deferred');
        var list = []; //var stack = 1;

        var parentItem = function(obj, callback) {
            var type = _.first(obj.get("_type").split("/")).toLowerCase();

            switch (type) {
                case 'task':
                    parentAttr = 'WorkProduct';
                    break;
                case 'defect':
                    parentAttr = 'Requirement';
                    break;
                case 'hierarchicalrequirement':
                    parentAttr = (!_.isNull(obj.get("Parent")) ? "Parent" : "PortfolioItem");
                    break;
                case 'portfolioitem':
                    parentAttr = 'Parent';
                    break;
            }
            
            var parentRef = obj.get(parentAttr);
            if (!_.isUndefined(parentRef) && !_.isNull(parentRef)) {
                // app.readObject(parentRef._type,parentRef).then({
                app.readObject(parentRef).then({
                    success: function(r) {
                        callback(r);
                    }
                });
            } else {
                callback(null);
            }
        };

        var walk = function(root) {
            list.push(root);
            parentItem(root, function(result) {
                if (result !== null) {
                    walk(result);
                } else {
                    deferred.resolve(list);
                }
            });
        };

        if (_.isUndefined(obj) || _.isNull(obj)) {
            deferred.resolve(null);
        } else {
            walk(obj);
            return deferred.promise;
        }
    },

    readUsers: function(items) {
        var promises = _.map(items, function(item) {
            var deferred = Ext.create('Deft.Deferred');
            var userRef = item.get("User");
            if (_.isUndefined(userRef) || _.isNull(userRef)) {
                deferred.resolve(null);
            } else {
                // app.readObject('User',userRef).then({
                app.readObject(userRef).then({
                    success: function(obj) {
                        deferred.resolve(obj);
                    }
                });
            }
            return deferred.promise;
        });
        return Deft.Promise.all(promises);
    },

    readTimeEntryItems: function(values) {
        var promises = _.map(values, function(v) {
            var deferred = Ext.create('Deft.Deferred');
            var ref = v.get("TimeEntryItem");

            //app.readObject('TimeEntryItem',ref).then({
            app.readObject(ref).then({
                success: function(obj) {
                    deferred.resolve(obj);
                }
            });
            return deferred.promise;
        });
        return Deft.Promise.all(promises);
    },

    _getDateFilter: function() {
        var startDateCmp = Ext.getCmp('startDate').getValue();
        var endDateCmp = Ext.getCmp('endDate').getValue();
        var start = Rally.util.DateTime.toIsoString(startDateCmp, false);
        var end = Rally.util.DateTime.toIsoString(endDateCmp, false);

        return [{
            property: 'DateVal',
            operator: '>=',
            value: start
        }, {
            property: 'DateVal',
            operator: '<=',
            value: end
        }];
    },

    _onSelect: function() {
        var grid = Ext.getCmp('tsGrid'),
            store = grid.getStore();

        store.clearFilter(true);
        store.filter(app._getDateFilter());
    },

    _onSelectDate: function(a, b, c) {
        console.log(a, b, c);
    },

    showMask: function(msg) {
        if (this.getEl()) {
            this.getEl().unmask();
            this.getEl().mask(msg);
        }
    },
    hideMask: function() {
        this.getEl().unmask();
    },
    _loadAStoreWithAPromise: function(model_name, model_fields, filters, ctx, order) {

        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        var config = {
            model: model_name,
            fetch: model_fields,
            filters: filters,
            limit: 'Infinity'
        };
        if (!_.isUndefined(ctx) && !_.isNull(ctx)) {
            config.context = ctx;
        }
        if (!_.isUndefined(order) && !_.isNull(order)) {
            config.order = order;
        }

        Ext.create('Rally.data.wsapi.Store', config).load({
            callback: function(records, operation, successful) {
                if (successful) {
                    deferred.resolve(records);
                } else {
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    }
});