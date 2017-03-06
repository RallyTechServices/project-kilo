var app = null;

Ext.define('TSApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType : 'iteration',
    devMode : false,
    // uncomment launch if setting devmode to true
    // launch: function() {
    //  this.callParent(arguments);
    //  app = this;
    //  app.onScopeChange();
    // },
    config: {
        defaultSettings: {
            maxIterations : 5
        }
    },

    onScopeChange : function( scope ) {
        // grab just the release data
        app = this;
        app.setupDateFormat();

        var maxIterations = parseInt(app.getSetting("maxIterations"));

        app.maxIterations = !_.isNaN(maxIterations) ? maxIterations : app.config.defaultSettings.maxIterations;

        console.log("scope",scope.getType(),scope);
        console.log("scope",scope.getRecord());

        if (app.devMode===true) {
            app.release =  {
                Name: "Release 1",
                ReleaseDate: "2016-05-15T06:59:59.000Z",
                ReleaseStartDate: "2016-02-15T06:00:00.000Z"
            };
        } else {
            app.release = !_.isUndefined(scope) ? scope.getRecord().raw : null;
            app.scope = scope;
        }
        app.run();
    },

    setupDateFormat : function() {
        app.dformat = app.getContext().getWorkspace().WorkspaceConfiguration.DateFormat;
        app.extDateFormat = ( app.dformat === "MM/dd/yyyy") ? "m/d" : "d/m";
    },

    run : function() {

        Deft.Chain.pipeline([
            this._getRelease,
            this._loadCapacityModel,
            this._loadReleases,
            this._loadIterations,
            this._loadTeamMembers,
            this._loadCapacities,
            this._createCapacityData,
            this._createCapacityGrid
        ]).then({
            success : function(res) {
                app.bundle = res;
                console.log(res);
            },
            failure : function(res) {
                console.log("failure",res);
                app.add({text:res});
            }
        });
    },

    _getRelease : function() {
        console.log("_getRelease");
        var deferred = Ext.create('Deft.Deferred');
        deferred.resolve({
            release : app.release,
            scope : app.scope
        });
        return deferred.promise;
    },

    _loadCapacityModel : function(bundle) {
        // UserIterationCapacity
        console.log("_loadCapacityModel");
        var deferred = Ext.create('Deft.Deferred');

        Rally.data.ModelFactory.getModel({
            type: 'UserIterationCapacity',
            success: function(model) {
                bundle.userIterationCapacityModel = model;
                deferred.resolve(bundle);
            }
        });
        return deferred.promise;
    },

    _loadReleases : function(bundle) {
        console.log("_loadReleases",bundle);
        var release = bundle.release;
        var deferred = Ext.create('Deft.Deferred');
        _loadAStoreWithAPromise(
                "Release", 
                true
                // ["Name","ReleaseStartDate","ReleaseDate"], 
                [{ property : "Name", operator : "=", value : release.Name }]
            ).then({
                success : function(records) {
                    bundle.releases = records;
                    deferred.resolve(bundle);
                },
                failure : function(e) {
                    deferred.reject(e);
                }
            });
        return deferred.promise;
    },

    createIterationQuery : function(scope) {

        if (scope.getType() === "release") {
            return [
                { property : "EndDate", operator : "<=", value : scope.getRecord().get("ReleaseDate") },
                { property : "EndDate", operator : ">",  value : scope.getRecord().get("ReleaseStartDate") }
            ];
        } else {
            return [
                { property : "StartDate", operator : ">=", value : scope.getRecord().get("StartDate") },
            ]
        }
    },

    _loadIterations : function(bundle) {
        console.log("_loadIterations");
        var release = bundle.release;
        var deferred = Ext.create('Deft.Deferred');
        var query = app.createIterationQuery(bundle.scope);
        console.log("Iteration Query",query);

        _loadAStoreWithAPromise(
                "Iteration", 
                ["Name","StartDate","EndDate"], 
                query,
                {
                    projectScopeDown : false,
                    projectScopeUp : false
                },
                "StartDate"
            ).then({
                success : function(records) {
                    records = _.sortBy(records,function(r){return r.get("StartDate")});
                    console.log(_.map(_.clone(records),function(r){return r.get("Name")}));

                    //if (bundle.scope.getType()==="iteration")
                        records = records.slice(0,app.maxIterations);
                    console.log("Iterations",records);
                    bundle.iterations = records;
                    console.log(_.map(records,function(r){return r.get("Name")}));

                    if (records.length>0)
                        deferred.resolve(bundle);
                    else
                        deferred.reject("No iterations found");
                },
                failure : function(e) {
                    console.log("failure",e);
                    deferred.reject(e);
                }
            });
        return deferred.promise;
    },

    _loadTeamMembers : function(bundle) {
        console.log("_loadTeamMembers");
        var deferred = Ext.create('Deft.Deferred');
        _loadAStoreWithAPromise(
                "Project", 
                ["Name","ObjectID","TeamMembers"], 
                [
                    { property : "ObjectID", operator : "=", value : app.getContext().getProject().ObjectID }
                ], {
                    projectScopeDown : false,
                    projectScopeUp : false
                },
                "EndDate"
            ).then({
                success : function(records) {
                    bundle.project = _.first(records);
                    bundle.project.getCollection('TeamMembers').load({
                        fetch : true,
                        callback : function(records,operation,success) {
                            if (success) {
                                bundle.teamMembers = records;
                                deferred.resolve(bundle);
                            } else {
                                deferred.reject("No TeamMembers");
                            }
                        }
                    });
                },
                failure : function(e) {
                    deferred.reject(e);
                }
            });
        return deferred.promise;
    },

    _loadCapacities : function(bundle) {
        console.log("_loadCapacities");
        var filter = createIterationCapacityFilter(bundle.iterations);
        var deferred = Ext.create('Deft.Deferred');
        _loadAStoreWithAPromise(
                "UserIterationCapacity", 
                true, 
                filter,
                {
                    projectScopeDown : false,
                    projectScopeUp : false
                }
            ).then({
                success : function(records) {
                    bundle.capacities = records;
                    deferred.resolve(bundle);
                },
                failure : function(e) {
                    deferred.reject(e);
                }
            });
        return deferred.promise;
    },

    uniqueCapacityUsers : function(bundle) {

        // the set of users shown is a combination of those users who are team members
        // or have a capacity set because they were added to the team.
        // get the users with capacities
        var capacityUsers = _.map(bundle.capacities,function(capacity) {
            return capacity.get("User");
        });
        // get unique list based on the user reference
        var uniqCapacityUserRefs = _.uniq(
            _.map(capacityUsers,function(user){
                return user._ref;
            })
        );

        var uniqCapacityUsers = _.map(uniqCapacityUserRefs,function(userRef) {
            return _.find(capacityUsers, function(capUser) {
                return userRef === capUser._ref;
            });
        });

        // add team mebers who have no capacity already set
        var teamMembersNoCapacity = _.compact(
            _.map(bundle.teamMembers,function(tm){
                var cu = _.find(uniqCapacityUsers,function(u){
                    return u._ref === tm.get("_ref");
                });
                return cu ? null : { _ref : tm.get("_ref"), _refObjectName : tm.get("_refObjectName") } ;
            })
        );

        return _.sortBy(
            _.union(uniqCapacityUsers,teamMembersNoCapacity),function(value) {
                return value._refObjectName.toUpperCase();
        });
    },

    _createCapacityData : function(bundle) {
        console.log("_createCapacityData");
        var deferred = Ext.create('Deft.Deferred');
        
        // columns
        bundle.columns = [
            {
                xtype:'actioncolumn',
                width:20,
                items: [{
                    icon: '/slm/js-lib/rui/builds/rui/resources/css/images/trash-icon.png',
                    tooltip: 'Delete',
                    handler: function(grid, rowIndex, colIndex) {

                        var data = grid.getStore().getAt(rowIndex).data;

                        Ext.Array.each(Ext.Object.getKeys(data), function(key){ 
                            if(key.indexOf('CapacityRef') > 0){
                                if(data[key]){
                                    data[key].destroy({
                                        callback: function(result, operation) {
                                            if(operation.wasSuccessful()) {
                                                console.log('deleted!');
                                            }
                                        }
                                    });
                                }
                            }
                        });

                        grid.getStore().removeAt(rowIndex);
                    },
                    scope: this
                }]
            }   
            ,
            // {
            //     text: 'Delete',
            //     //xtype:'rallybutton',
            //     renderer : function() {
            //         return '<div iconCls="icon-delete">Del</div>';
            //     },
            //     iconCls: 'icon-delete',
            //     listeners: {
            //         click: {
            //             scope: this,
            //             fn: function () {
            //                 var grid = Ext.getCmp('capacity_panel');
            //                 var selection = grid.getView().getSelectionModel().getSelection()[0];
            //                 if (selection) {
            //                     grid.store.remove(selection);
            //                 }
            //             }
            //         }
            //     }
            // },
            {
                id : 'name',
                header : 'Name',
                dataIndex : 'name',
                width : 250
            }, {
                id : 'total',
                header : 'Total',
                dataIndex : 'total',
                flex : 1,
                width : 100,
                renderer : function(value) {
                    return Ext.String.format('<div style="background-color:#EEEEEE">{0} h</div>', value);
                }
            }
        ];

        // fields
        bundle.fields = [
                {name: 'name', type: 'string'},
                {name: 'userRef', type: 'string'}
        ];

        var shortName = function(i) {
            // return i.get("Name").replace(/\s+/g, '');
            return (i.get("Name").replace(/\s+/g, '')).replace(/\.+/g, '');
        };
        var capacityRefName = function(i) {
            return shortName(i) + "CapacityRef";
        };

        var renderer = function( value ) {
            return (value>0) ? value : "";
        };

        var iterationHeader = function(i) {
            var start = i.get("StartDate");
            var end = i.get("EndDate");

            return i.get("Name") + "<br/>" + 
                    Ext.Date.format(start, app.extDateFormat) + 
                    " - " + 
                    Ext.Date.format(end, app.extDateFormat) +
                    " (" +
                    workingDaysBetweenDates(start,end) + 
                    ")";
        }

        // add field (name & ref to capacity object) for each iteration
        _.each(bundle.iterations,function(i,x) {

            bundle.fields.push({
                name : shortName(i),
                type : 'number'
            });
            bundle.fields.push({
                name : capacityRefName(i) ,
                type : 'object'
            });

            bundle.columns.push({
                iterationRef : i.get("_ref"),
                id : shortName(i),
                header : iterationHeader(i),
                dataIndex : shortName(i),
                flex : 1,
                field : {},
                renderer : renderer,
                editor: {
                    selectOnFocus: true
                },
                summaryType: 'sum',
                summaryRenderer: function(value, summaryData, dataIndex) {
                    return Ext.String.format('<div style="background-color:#EEEEEE">{0} h</div>', value);
                }
            });
        });

        // Total field is a calculated field based on the iteration field values.
        bundle.fields.push({
            name: 'total', 
            type: 'number',
            convert : function(val,row) {
                var x = 0;
                _.each(bundle.fields,function(f){
                    if (f.name!=='total'&&f.type==='number')
                        x = x + row.data[f.name];
                });
                return x;
            }
        });

        // create the custom model for the grid
        bundle.model = Ext.define('userCapacity.Row', {
            extend: 'Ext.data.Model',
            fields: bundle.fields
        });

        // create the data for the grid
        bundle.data = _.map(app.uniqueCapacityUsers(bundle),function(tm) {
            var capacities = _.filter(bundle.capacities,function(c){
                return tm._ref === c.get("User")._ref;
            });
            var zip1 = _.zipObject( 
                _.map(bundle.iterations, function(i) { return shortName(i); }),
                _.map(bundle.iterations, function(i) { 
                    var capacity = _.find(capacities,function(c){
                        return c.get("Iteration")._ref === i.get("_ref");
                    });
                    return capacity ? capacity.get("Capacity") : null;
                })
            );
            var zip2 = _.zipObject( 
                _.map(bundle.iterations, function(i) { return capacityRefName(i); }),
                _.map(bundle.iterations, function(i) { 
                    var capacity = _.find(capacities,function(c){
                        return c.get("Iteration")._ref === i.get("_ref");
                    });
                    return capacity ? capacity : null;
                })
            );
            var zip = _.assign(zip1,zip2,
            {
                name : tm._refObjectName,
                userRef : tm._ref,
                total : 0           
            });
            return zip;
        });

        // store
        bundle.store = Ext.create('Ext.data.Store', {
            model: bundle.model,
            autoLoad: true,
            data : bundle.data,
            fields: _.map(bundle.fields,function(f) { return f.name; })
        });

        deferred.resolve(bundle);

        return deferred.promise;

    },

    _createCapacityGrid : function(bundle) {

        console.log("_createCapacityGrid");
        var deferred = Ext.create('Deft.Deferred');

        // clear the grid
        if (!_.isNull(app.grid)) {
            app.remove(app.grid);
        }

        // inline edit plugin
        var cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
            clicksToEdit: 1
        });

        // called when Add User is clicked
        var addUser = function() {
            // Create a record instance through the ModelManager
            var userSearch = app.down("#userComboBox");
            if (userSearch.getValue===null)
                return;
            var record = userSearch.getRecord();
            // check to see if the user is in the table
            var alreadyInStore = _.find( bundle.store.data.items,function(i){
                return i.get("userRef") === record.get("_ref");
            });
            if (alreadyInStore)
                return;
            // create the grid store record
            var r = Ext.create('userCapacity.Row', {
                name : record.get("_refObjectName"),
                userRef : record.get("_ref")
            });
            bundle.store.insert(0, r);
            // start editing
            cellEditing.startEditByPosition({row: 0, column: 2});
        };

        // called to save or create a capacity record in AC
        var saveCapacityRecord = function(rec, column,value,callback) {
            var iRef = column.iterationRef; // iteration ref
            var uRef = rec.get("userRef"); // user ref
            var cRef = rec.get(column.id+"CapacityRef"); // capacity ref if already exists

            value = value==="" ? 0 : value; // set the value to zero if empty string

            // if no capacity reference is set then its a new record
            var record = null;
            if (_.isUndefined(cRef) || _.isNull(cRef) || cRef==="") {
                record = Ext.create( bundle.userIterationCapacityModel, {
                    Iteration : iRef,
                    Project : app.getContext().getProject(),
                    User : uRef
                });
                record.set(column.id+"CapacityRef",record);
            } else {
                record = cRef;
            }

            // set the value to the record and save.
            record.set("Capacity",value);
            record.save({
                callback : function(result,operation) {
                    console.log(result,operation);
                    callback(operation.wasSuccessful());
                }
            });
        };


        // called to delete capacity records in AC
        var deleteCapacityRecords = function(rec, column,value,callback) {
            var iRef = column.iterationRef; // iteration ref
            var uRef = rec.get("userRef"); // user ref
            var cRef = rec.get(column.id+"CapacityRef"); // capacity ref if already exists

            value = value==="" ? 0 : value; // set the value to zero if empty string

            // if no capacity reference is set then its a new record
            var record = null;
            if (_.isUndefined(cRef) || _.isNull(cRef) || cRef==="") {
                record = Ext.create( bundle.userIterationCapacityModel, {
                    Iteration : iRef,
                    Project : app.getContext().getProject(),
                    User : uRef
                });
                record.set(column.id+"CapacityRef",record);
            } else {
                record = cRef;
            }

            // set the value to the record and save.
            record.set("Capacity",value);
            record.save({
                callback : function(result,operation) {
                    console.log(result,operation);
                    callback(operation.wasSuccessful());
                }
            });
        };

        // called when update default is called. Fills all empty cells with the specified value
        var updateDefault = function() {

            var defaultValue = app.down("#defaultCapacityValue").getValue();
            // if no value set return
            if (defaultValue===null || defaultValue===undefined || defaultValue==="" || defaultValue===0)
                return;

            // we only look at the columns that represent iterations
            var iterationColumns = _.filter(app.grid.columns,function(col){
                return !_.isUndefined(col.iterationRef);
            });
            
            var recordsToCommit = [];
            // iterate each item in the store and look at each iteration cell for empty values
            bundle.store.data.each(function(item, index, totalItems ) {
                var rtc = null;
                _.each(iterationColumns,function(ic){
                    if (item.get(ic.id)===0) {
                        rtc = _.isNull(rtc) ? { record: item, cols : [] } : rtc;
                        rtc.cols.push(ic);
                        item.set(ic.id,defaultValue);
                    }
                });
                if (!_.isNull(rtc)) { recordsToCommit.push(rtc); }
            });

            // show a dialog to confirm changes. If 'yes' save changes and commit
            Ext.Msg.show({
                title:'Save Changes?',
                msg: 'Are you sure you want to save these changes ?',
                buttons: Ext.Msg.YESNO,
                fn: function(btn,text) {
                    if (btn==="yes") {
                        _.each(recordsToCommit,function(rtc) {
                            _.each(rtc.cols,function(col){
                                saveCapacityRecord(rtc.record,col,rtc.record.get(col.id),function(success) {
                                    rtc.record.commit();
                                });
                            });
                        });
                    } else {
                        _.each(recordsToCommit,function(rtc){
                            rtc.record.reject();
                        });
                    }
                },
                animEl: 'elId'
            });
        };

        // called when a cell is edited
        var editUserCapacity = function(editor, e) {
            // commit the changes right after editing finished
            // only update iteration columns
            if (e.value==e.originalValue)
                return; // unchanged
            var v = (e.value!=="") ? parseInt(e.value) : 0;
            if (_.isNaN(v) || v > 999) {
                e.record.reject();
                return;
            }

            saveCapacityRecord(e.record,e.column,v,function(success){
                if (success) {
                    e.record.set('total',0); // force recalc of total column
                    e.record.commit();
                } else {
                    e.record.reject();
                }
            });
        };

        // create the grid and specify what field you want
        // to use for the editor at each header.
        app.grid = Ext.create('Ext.grid.Panel', {
            store: bundle.store,
            id:'capacity_panel',
            columns : bundle.columns,
            selModel: {
                selType: 'cellmodel'
            },
            // width: 1200,
            // height: 400,
            title: 'Team Member Capacities',
            frame: true,
            plugins: [cellEditing],
            features: [
                {ftype: 'grouping',  showSummaryRow: true, groupHeaderTpl: ' {name}'},
                {ftype: 'summary'}
            ],
            tbar: [{
                xtype: 'rallyusersearchcombobox',
                project: app.getContext().getProject(),
                itemId : 'userComboBox'
            },{
                text: 'Add User',
                handler : addUser
            },{
                xtype: 'textfield',
                itemId : 'defaultCapacityValue'
            },{
                text: 'Update Default',
                handler : updateDefault
            }]
        });

        app.grid.on('edit', editUserCapacity); 
        app.add(app.grid);
        deferred.resolve(bundle);
        return deferred.promise;
    },

    getSettingsFields: function() {

        return [
        {
                name: 'maxIterations',
                xtype: 'rallytextfield',
                boxLabelAlign: 'after',
                fieldLabel: 'Maximum number of iterations to show',
                margin: '0 0 15 50',
                labelStyle : "width:200px;",
                afterLabelTpl: 'Enter a<span style="color:#999999;"><i> number </i></span> which represents the maximum number of iteration columns'
        } ];

    }


});

// Ext.define("TSApp", {
//     extend: 'Rally.app.App',
//     componentCls: 'app',
//     logger: new Rally.technicalservices.Logger(),
//     defaults: { margin: 10 },
//     items: [
//         {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
//         {xtype:'container',itemId:'display_box'}
//     ],

//     integrationHeaders : {
//         name : "TSApp"
//     },
                        
//     launch: function() {
//         var me = this;
//         this.setLoading("Loading stuff...");

//         this.down('#message_box').update(this.getContext().getUser());
        
//         var model_name = 'Defect',
//             field_names = ['Name','State'];
        
//         this._loadAStoreWithAPromise(model_name, field_names).then({
//             scope: this,
//             success: function(store) {
//                 this._displayGrid(store,field_names);
//             },
//             failure: function(error_message){
//                 alert(error_message);
//             }
//         }).always(function() {
//             me.setLoading(false);
//         });
//     },
      
//     _loadWsapiRecords: function(config){
//         var deferred = Ext.create('Deft.Deferred');
//         var me = this;
//         var default_config = {
//             model: 'Defect',
//             fetch: ['ObjectID']
//         };
//         this.logger.log("Starting load:",config.model);
//         Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
//             callback : function(records, operation, successful) {
//                 if (successful){
//                     deferred.resolve(records);
//                 } else {
//                     me.logger.log("Failed: ", operation);
//                     deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
//                 }
//             }
//         });
//         return deferred.promise;
//     },

//     _loadAStoreWithAPromise: function(model_name, model_fields){
//         var deferred = Ext.create('Deft.Deferred');
//         var me = this;
//         this.logger.log("Starting load:",model_name,model_fields);
          
//         Ext.create('Rally.data.wsapi.Store', {
//             model: model_name,
//             fetch: model_fields
//         }).load({
//             callback : function(records, operation, successful) {
//                 if (successful){
//                     deferred.resolve(this);
//                 } else {
//                     me.logger.log("Failed: ", operation);
//                     deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
//                 }
//             }
//         });
//         return deferred.promise;
//     },
    
//     _displayGrid: function(store,field_names){
//         this.down('#display_box').add({
//             xtype: 'rallygrid',
//             store: store,
//             columnCfgs: field_names
//         });
//     },
    
//     getOptions: function() {
//         return [
//             {
//                 text: 'About...',
//                 handler: this._launchInfo,
//                 scope: this
//             }
//         ];
//     },
    
//     _launchInfo: function() {
//         if ( this.about_dialog ) { this.about_dialog.destroy(); }
//         this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
//     },
    
//     isExternal: function(){
//         return typeof(this.getAppId()) == 'undefined';
//     }
    
// });
