var app = null;

Ext.define('CustomApp', {
	// extend: 'Rally.app.App',
	extend: 'Rally.app.TimeboxScopedApp',
	componentCls: 'app',
	scopeType : 'release',
	items : [
		{ xtype:'container',itemId:'settings_box'}
	],

	config: {
		defaultSettings: {
			baselineType :  'End of first Sprint', // 'Select Date', // 'End of first Sprint', // 'End of first Day'
			aggregateType : 'Count',
			baselineDate : '',
			configScheme : 'Scheme1'
			// baselineDate : "02/10/2016"
		}
	},
	devMode : false,
	// uncomment launch if setting devmode to true
	// launch: function() {
	// 	this.callParent(arguments);
	// 	app = this;
	// 	// app.onScopeChange();
	// },

	customBaselineDateField : 'c_ScopeBaselineDate',
	fetch : ['FormattedID','ObjectID', '_ValidTo', '_ValidFrom', 'PreliminaryEstimate', 'RefinedEstimate',
		'AcceptedLeafStoryCount', 'AcceptedLeafStoryPlanEstimateTotal', 
		'LeafStoryCount', 'LeafStoryPlanEstimateTotal','PercentDoneByStoryCount',
		'PercentDoneByStoryPlanEstimate','Predecessors','Name'],

	seriesKeys : ['BaselineScope','BaselineScopeInProgress','BaselineScopeCompleted','AddedScope','AddedScopeInProgress','AddedScopeCompleted'],

	isExternal: function(){
		return typeof(this.getAppId()) == 'undefined';
	},

	onScopeChange : function( scope ) {
		// grab just the release data

		app = this;
		this.clear();
		// console.log("onScopeChange",scope,scope.getRecord());
		if (_.isNull(scope.getRecord())) {
			this.add({html:"Select A Release"});
			return;
		}

		this.release = (!_.isUndefined(scope) && !_.isNull(scope)) ? scope.getRecord().raw : null;

		if (_.isNull(this.release)) {
			this.add({html:"This app must be installed in a release filtered page."});
			return;
		}

		
		app.bundle = {};

		Deft.Chain.pipeline([
			this._getRelease,
			this._loadPreliminaryEstimateValues,
			this._loadPortfolioItemTypes,
			this._loadReleases,
			this._loadIterations,
			this._getSnapshots,
			this._process,
			this._setBaseline,
			this._categorize,
			this._prepareChartData,
			this._createChart
		]).then({
			success : function(res) {
				app.bundle = res;
			},
			failure : function(res) {
				console.log("failure",res);
				app.add({text:res});
			}
		});

	},

	// _loadAStoreWithAPromise: function( model_name, model_fields, filters,ctx,order) {
	containsKey : function(bundle,key) {
		return (_.findIndex(_.keys(bundle),key) !== -1 );
	},

	_getRelease : function() {
		console.log("_getRelease");
		var deferred = Ext.create('Deft.Deferred');
		if (app.devMode===true) {
			deferred.resolve({
				release :  {
						// Name: "2016 Q1",
						// ReleaseDate: "2016-01-18T06:59:59.000Z",
						// ReleaseStartDate: "2016-04-09T06:00:00.000Z"
						Name: "Release 1",
						ReleaseDate: "2016-05-15T06:59:59.000Z",
						ReleaseStartDate: "2016-02-15T06:00:00.000Z"

						// Name: "Release 1",
						// ReleaseDate: "2014-11-30T06:59:59.000Z",
						// ReleaseStartDate: "2015-03-01T06:00:00.000Z"
						// Name: "Release 4",
						// ReleaseDate: "2015-12-31T06:59:59.000Z",
						// ReleaseStartDate: "2015-10-01T06:00:00.000Z"
						// Name: "AC7",
						// ReleaseDate: "2016-01-05T06:59:59.000Z",
						// ReleaseStartDate: "2015-10-15T06:00:00.000Z"

						}
				}
			);
		} else {
			deferred.resolve({
				release : app.release
			});
		}
		return deferred.promise;
	},

	_loadPreliminaryEstimateValues : function(bundle) {
		app.showMask("loading timeboxes ...");
		console.log("_loadPreliminaryEstimateValues");
		var deferred = Ext.create('Deft.Deferred');

		if ( app.containsKey(bundle,"prelimEstimateValues")) {
			deferred.resolve(bundle);
		} else {
			app._loadAStoreWithAPromise( 
				'PreliminaryEstimate',
				true,
				[]).then({
					success : function(records) {
						bundle.prelimEstimateValues = records;
						app.bundle = bundle;
						deferred.resolve(bundle);
					}
				});
		}
		return deferred.promise;
	},	

	_loadPortfolioItemTypes : function(bundle) {
		console.log("_loadPortfolioItemTypes");
		var deferred = Ext.create('Deft.Deferred');

		if ( app.containsKey(bundle,"piTypes")) {
			deferred.resolve(bundle);
		} else {
			app._loadAStoreWithAPromise( 
				'TypeDefinition',
				true,
				[ { property:"Ordinal", operator:"!=", value:-1} ]).then({
					success : function(records) {
						bundle.piTypes = records;
						deferred.resolve(bundle);
					}
				});
		}
		return deferred.promise;

	},

	_loadReleases : function(bundle) {
		console.log("_loadReleases",bundle);
		var release = bundle.release;
		var deferred = Ext.create('Deft.Deferred');
		app._loadAStoreWithAPromise(
				"Release", 
				// true,
				["Name","ReleaseDate","ReleaseStartDate","c_ScopeBaselineDate","ObjectID"],
				[{ property : "Name", operator : "=", value : release.Name }]
				
			).then({
				success : function(records) {
					console.log("releases",records);
					bundle.releases = records;
					deferred.resolve(bundle);
				},
				failure : function(e) {
					deferred.reject(e);
				}
			});
		return deferred.promise;
	},

	_loadIterations : function(bundle) {
		console.log("_loadIterations");
		var release = bundle.release;
		var deferred = Ext.create('Deft.Deferred');
		// model_name, model_fields, filters,ctx,order
		app._loadAStoreWithAPromise(
				"Iteration", 
				["Name","StartDate","EndDate"], 
				[
					{ property : "EndDate", operator : "<=", value : release.ReleaseDate },
					{ property : "EndDate", operator : ">", value : release.ReleaseStartDate }
				], {
					projectScopeDown : false
				},
				"EndDate"
			).then({
				success : function(records) {
					bundle.iterations = records;
					if (records.length>0)
						deferred.resolve(bundle);
					else
						deferred.reject("No iterations found");
				},
				failure : function(e) {
					deferred.reject(e);
				}
			});
		return deferred.promise;
	},

	_getSnapshots : function(bundle) {
		console.log("_getSnapshots");
		var releases = bundle.releases;
		var deferred = new Deft.Deferred();
		Ext.create('Rally.data.lookback.SnapshotStore', {
			autoLoad : true,
			limit: Infinity,
			listeners: {
				refresh: function(store) {
					var snapshots = [];
					for (var i = 0, ii = store.getTotalCount(); i < ii; ++i) {
						snapshots.push(store.getAt(i).data);
					}
					// console.log("snapshots",snapshots);
					bundle.snapshots = snapshots;
					deferred.resolve(bundle);
				}
			},
			fetch: app.fetch,
			find: {
				"_TypeHierarchy" : { "$in" : [_.first(bundle.piTypes).get("TypePath")] },
				"Release" : { "$in" : _.map(releases,function(r){return r.get("ObjectID");})}
			},
			sort: { "_ValidFrom": 1 }
		});
		return deferred.getPromise();
	},

	_process : function(bundle) {

		var deferred = new Deft.Deferred();
		app.showMask("Processing snapshots...");

		// add a range object for each snapshot, we use it later to see if the day is in that range
		_.each(bundle.snapshots,function(s){
			s.range = moment.range(s._ValidFrom,s._ValidTo);
		});

		bundle.dateRange = app.dateRange(bundle.release);
		// console.log(bundle.release,_.last(dr));
		// iterate each day of the release
		// data is an array of objects; each object is keyed by the category and the key value is the 
		// set of applicable features
		bundle.data = _.map(bundle.dateRange,function( day, index ) {
			// filter to just the snapshots for that day
			var daySnapshots = _.filter(bundle.snapshots,function(s){
				return day.within(s.range);
			});
			// group the snapshots by id (there may be more than one in each day)
			var groupedById = _.groupBy(daySnapshots,"ObjectID");
			// get just the last snapshot for each day
			var dayFeatures = _.map( _.keys(groupedById), function(key) {
				return _.last(_.sortBy(groupedById[key],function(s) { return moment(s._ValidFrom);}));
			});
			return dayFeatures;
		});
		deferred.resolve(bundle);
		return deferred.promise;
	},

	_setBaseline : function(bundle) {
		var deferred = new Deft.Deferred();
		// construct the date range array (array of dates for the release)
		// var dr = app.dateRange(bundle.release);
		// get todays index into the release
		// bundle.todayIndex = _.findIndex(dr, moment(moment().format("M/D/YYYY")));
		var today = moment();
		bundle.todayIndex = _.findIndex(bundle.dateRange, function(r) {
			return r.year() === today.year() && r.month() === today.month() && r.date() === today.date();
		} );
		// console.log("today",bundle.todayIndex);

		// get the index of the baseline date
		bundle.baselineIndex = app.getBaselineIndex(bundle.dateRange,bundle.iterations);
		// initiatlize the baseline (the set of features that exist on the baseline)
		bundle.baseline = _.clone(bundle.data[bundle.baselineIndex]);
		// get the set of indexes into release array that represent end dates of iterations
		bundle.iterationIndices = app.dateIndexes( bundle.dateRange, _.map(bundle.iterations,function(i){ return moment(i.raw.EndDate);}));
		deferred.resolve(bundle);
		return deferred.promise;
	},

	_categorize : function(bundle) {

		bundle.configScheme = configSchemes[app.getSetting("configScheme")];

		var deferred = new Deft.Deferred();
		// var dr = app.dateRange(bundle.release);

		// array of array of daily values
		bundle.seriesData = _.map( bundle.data, function( dayFeatures, index ) {
			return bundle.configScheme.categorize( bundle, dayFeatures, index );
		});
		// console.log("seriesData",bundle.seriesData);

		deferred.resolve(bundle);
		return deferred.promise;
	},

	// prepare the chart data by transforming the data array into a set of highcharts series objects
	_prepareChartData : function( bundle ) {

		var deferred = new Deft.Deferred();

		app.showMask("Preparing chart...");

		var series = _.map( bundle.configScheme.seriesLabels, function(label,y) {
			return {
				type : (label==="Capacity" || label==="Load" ? "line" : "column"),
				visible: (label==="Capacity" || label==="Load" ? false : true),
				name : label,
				data : _.map(bundle.seriesData,function(d,x){
					return { 
						x : x, 
						y : d[y].value, 
						features : d[y].features,
						color : !_.isUndefined(d[y].color) ? d[y].color : null 
					};
				})
			};
		});

		bundle.chartData = { series : series };
		deferred.resolve( bundle ) ;
		return deferred.promise;
	},

	_createChart : function( bundle ) {

		app.hideMask();
		var deferred = new Deft.Deferred();

		if (!_.isUndefined(app.chart)) {
			app.remove(app.chart);
		}

		app.chart = Ext.create('Rally.technicalservices.scopeChangeChart', {
			itemId: 'rally-chart',
			chartColors : bundle.configScheme.colors,
			chartData: bundle.chartData,
			iterationIndices : bundle.iterationIndices,
			baselineIndex : bundle.baselineIndex,
			dateRange : bundle.dateRange,
			releaseDateString : _.last(bundle.dateRange).format("M/D/YYYY"),
			app : app,
			listeners : {
				// called when user clicks on a series in the chart
				series_click : app.showItemsTable,
				scope : app
			}
		});
		app.add(app.chart);
		deferred.resolve(bundle);
		return deferred.promise;
	},

	// remove the extjs components from the page
	clear : function() {
		var that = this;
		if (!_.isUndefined(that.itemsTable)) {
			that.remove(that.itemsTable);
		}
		if (!_.isUndefined(that.scopeGrid)) {
			that.remove(that.scopeGrid);
		}
		if (!_.isUndefined(that.chart)) {
			that.remove(that.chart);
		}
		if (!_.isUndefined(that.tabPanel)) {
			that.remove(that.tabPanel);
		}
	},

	// The release is an array of dates; find the index of the date for the baseline. 
	// The baseline date is based on the selected configuration
	getBaselineIndex : function(range,iterations) {

		var baselineType = app.getSetting("baselineType");
		var baselineDate = null;
		// console.log(baselineType,app.getSetting('baselineDate'));

		var indexInRange = function(date) {
			return _.findIndex(range, function(r) {
				return r.format() === date;
			} );
		};

		if (baselineType ==='End of first Day') {
			return 0;
		}
		if (baselineType ==='End of first Sprint') {
			var iterationEndDate = moment( moment(_.first(iterations).raw.EndDate).format("M/D/YYYY"));
			return indexInRange(iterationEndDate.format());
		}
		if (baselineType ==='Select Date') {
			var bd = app.getSetting('baselineDate');
			// console.log("baselinedate",bd);
			app.dformat = app.getContext().getWorkspace().WorkspaceConfiguration.DateFormat;
			app.dformat = app.dformat.toUpperCase();
			// console.log("dateformat",app.dformat.toUpperCase());

			baselineDate = moment( moment(app.getSetting('baselineDate'),app.dformat).format("M/D/YYYY"));
			// console.log("baselineDate",baselineDate);
			return indexInRange(baselineDate.format());
		}
		if (baselineType==='ScopeBaselineDate Field') {
			// find release object for selected project
			// console.log("project",app.getContext().getProject().ObjectID);
			// console.log("bundle",app.bundle);
			var release = _.find(app.bundle.releases,function(r){
				return r.get("Name") === app.bundle.release.Name &&
					r.get("Project").ObjectID === app.getContext().getProject().ObjectID;
			});
			// console.log("release",release);
			baselineDate = moment( moment(release.get(app.customBaselineDateField)).format("M/D/YYYY"));
			return indexInRange(baselineDate.format());
		}

		return 0;
	},

	// returns an array of features that have been added or removed since the baseline
	getScopeChangeFeatures : function(chart,x) {

		var that = this;

		var seriesRemovedIndex = _.findIndex(app.bundle.configScheme.seriesLabels,function(l) { return l === "Removed"; });
		var removedFeatures = chart.series[seriesRemovedIndex].data[x].features;

		// aggregate the features for all series for the selected data
		var currentFeatures = _.compact(_.flatten(_.map(chart.series,function(s) { return s.data[x].features; })));
		var previousFeatures = app.bundle.baseline;
		// get feature ids for comparison
		var cFeatures = _.uniq(_.map( currentFeatures, function(f) { return f.FormattedID; }));
		var pFeatures = _.uniq(_.map( previousFeatures, function(f) { return f.FormattedID; }));

		// var removed = _.difference(pFeatures, cFeatures);
		var removed = _.map(removedFeatures,function(f){return f.FormattedID;});
		var added = _.difference(cFeatures, pFeatures);

		var findit = function( features, fid ) {
			return _.find( features, function(f){ return f.FormattedID === fid; });
		};

		var r = _.map ( removed, function(fid) { 
			var f = findit(previousFeatures,fid);
			f.Scope = "Removed";
			return f;
		});

		var a = _.map ( added, function(fid) { 
			var f = findit(currentFeatures,fid);
			f.Scope = "Added";
			return f;
		});

		return a.concat(r);

	},

	addScopeChangeTable : function( features ) {

		var that = this;

		// create the data store
		var store = new Ext.data.ArrayStore({
			fields: [
				{name: 'Scope'},
				{name: 'FormattedID' },
				{name: 'Name' },
				{name: 'PreliminaryEstimate' }
			]
		});
		store.loadData(features);

		var grid = new Ext.grid.GridPanel({
			store: store,
			columns: [
				{ header: "Scope", sortable: true, dataIndex: 'Scope'},
				{ header: "ID", sortable: true, dataIndex: 'FormattedID'},
				{ header: "Name", sortable: true, dataIndex: 'Name',width:250},
				{ header: "Size", sortable: true, dataIndex: 'PreliminaryEstimate' ,
					renderer : function(value, p, record){
						var estimate = _.find(app.bundle.prelimEstimateValues,function(v) {
							return value === v.get("ObjectID");
						});
						return estimate ? estimate.get("Name") + " (" + estimate.get("Value") + ")" : "(None)";
					}
				}
			],
			stripeRows: true,
			title:'Scope Change Since Baseline'
		});

		// that.add(grid);
		return grid;
	},

	// returns a function to aggregate the features based on the app configuration
	getReducerFunction : function() {

		var that = this;
		var reducerFn = null;

		// simple count of features
		var countReducer = function(features) {
			return features.length;
		};

		// sum of story points for the features
		var pointsReducer = function(features) {
			return _.reduce(features,function(memo,feature) { 
				return memo + feature.LeafStoryPlanEstimateTotal; }, 0 );
		};

		// sum of preliminary estimate values for the features
		var estimateReducer = function(features) {
			return _.reduce(features,function(memo,feature) { 
				var estimate = _.find(app.bundle.prelimEstimateValues,function(v) {
					return feature.PreliminaryEstimate === v.get("ObjectID");
				});
				return memo + (_.isUndefined(estimate) ? 0 : estimate.get("Value")); 
			}, 0 );
		};

		switch( that.getSetting('aggregateType') ) {
			case 'Points': reducerFn = pointsReducer; break;
			case 'Count': reducerFn = countReducer; break;
			case 'Preliminary Estimate': reducerFn = estimateReducer; break;
		}

		return reducerFn;

	},

	// create a filter for showing a set of features based on their object id's
	createFilterFromFeatures : function(features) {

		var filter = null;
		_.each(features,function(f){
			filter = filter === null ?
				Ext.create('Rally.data.wsapi.Filter', {
					property: 'ObjectID', operator: '=', value: f.ObjectID
				}) :
				filter.or( {
					property: 'ObjectID', operator: '=', value: f.ObjectID
				});
		});
		return filter;
	},

	// called when a data value is clicked. Shows a grid of the features that make up that data point.
	showItemsTable : function( event ) {
		var that = this;

		var scopeChangeFeatures = that.getScopeChangeFeatures(event.series.chart,event.x);
		that.scopeGrid = that.addScopeChangeTable(scopeChangeFeatures);

		if (!_.isUndefined(that.tabPanel)) {
			that.remove(that.tabPanel);
		}

		var filter = that.createFilterFromFeatures(event.features);

		Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
			// models: ['PortfolioItem/Feature'],
			models: [_.first(app.bundle.piTypes).get("TypePath")],
			filters : [filter],
			autoLoad: true,
			enableHierarchy: true,
			listeners : {
				load : function(a,b,c) {
				}
			}
		}).then({
			success: function(store) {
				// remove table if it already exists
				if (!_.isUndefined(that.itemsTable)) {
					that.remove(that.itemsTable);
				}
				that.itemsTable = Ext.create('Rally.ui.grid.TreeGrid',{
					xtype: 'rallytreegrid',
					store: store,
					context: that.getContext(),
					enableEditing: false,
					enableBulkEdit: false,
					shouldShowRowActionsColumn: false,
					enableRanking: false,
					columnCfgs: [
						'Name', 'Predecessors', 'State', 'Release', 'Project',
						{ dataIndex : 'PreliminaryEstimate'},
						{ dataIndex : 'PercentDoneByStoryCount', text : '% (C)'},
						{ dataIndex : 'PercentDoneByStoryPlanEstimate', text : '% (P)'},
						{ dataIndex : 'LeafStoryPlanEstimateTotal', text: 'Points'},
						{ dataIndex : 'LeafStoryCount', text : 'Count'},
						{ dataIndex : 'PlanEstimate', text: 'Points(S)'},
						{ dataIndex : 'ScheduleState', text : 'State(S)'}

					]
				});

				that.tabPanel = Ext.create('Ext.tab.Panel', {
					items: [{
						title: 'Series',
						items : [that.itemsTable]
					}, {
						title: 'Change',
						items : [that.scopeGrid]
					}]
				});

				that.add(that.tabPanel);
			}
		});
	},

	// returns an array of indexes for a set of dates in a range
	dateIndexes : function(range,dates) {
		var that = this;
		var indices = [];
		var normDates = _.map(dates,function(d){ return moment(d.format("M/D/YYYY"));});

		_.each(range,function(day,i){
			var d = moment(day.format("M/D/YYYY"));
			var x = _.findIndex(normDates,d);
			if (x !== -1) indices.push(i);
		});
		return indices;
	},

	dateRange : function(release) {
		var dr = [];
		var range = moment.range( moment(release.ReleaseStartDate), moment(release.ReleaseDate) );
		range.by('days',function(m) {
			dr.push( moment(m.format("M/D/YYYY")));
		},false);
		return dr;
	},

	_loadAStoreWithAPromise: function( model_name, model_fields, filters,ctx,order) {

		var deferred = Ext.create('Deft.Deferred');
		var me = this;

		var config = {
			model: model_name,
			fetch: model_fields,
			filters: filters,
			limit: 'Infinity'
		};
		if (!_.isUndefined(ctx)&&!_.isNull(ctx)) {
			config.context = ctx;
		}
		if (!_.isUndefined(order)&&!_.isNull(order)) {
			config.order = order;
		}

		Ext.create('Rally.data.wsapi.Store', config ).load({
			callback : function(records, operation, successful) {
				if (successful){
					deferred.resolve(records);
				} else {
					deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
				}
			}
		});
		return deferred.promise;
	},

	getSettingsFields: function() {

		var aggregateStore = new Ext.data.ArrayStore({
			fields: ['aggregate'],
			data : [['Count'],['Points'],['Preliminary Estimate']]
		});  

		var baselineTypeStore = new Ext.data.ArrayStore({
			fields: ['baselineType'],
			data : [['End of first Day'],['End of first Sprint'],['Select Date'],['ScopeBaselineDate Field'] /*,['Day Index'],['Specific Date']*/ ]
		});  

		var configSchemeStore = new Ext.data.ArrayStore({
			fields: ['configScheme'],
			data : [['Scheme1']]
		});  

		return [ 
			{
				name: 'aggregateType',
				xtype: 'combo',
				disabled : true,
				store : aggregateStore,
				valueField : 'aggregate',
				displayField : 'aggregate',
				queryMode : 'local',
				forceSelection : true,
				boxLabelAlign: 'after',
				fieldLabel: 'Aggregate Type',
				margin: '0 0 15 50',
				labelStyle : "width:200px;",
				afterLabelTpl: 'Choose <span style="color:#999999;"><i>Count</i> or <i>points</i></span>'
			},
			{
				name: 'baselineType',
				xtype: 'combo',
				store : baselineTypeStore,
				valueField : 'baselineType',
				displayField : 'baselineType',
				queryMode : 'local',
				forceSelection : true,
				boxLabelAlign: 'after',
				fieldLabel: 'Baseline Type',
				margin: '0 0 15 50',
				labelStyle : "width:200px;",
				afterLabelTpl: 'Choose <span style="color:#999999;"><i>Baseline Type</i></span>'
			},
			{
				name: 'baselineDate',
				xtype: 'rallydatefield',
				boxLabelAlign: 'after',
				fieldLabel: 'Baseline Date',
				margin: '0 0 15 50',
				labelStyle : "width:200px;",
				afterLabelTpl: 'Choose <span style="color:#999999;"><i>Baseline Date</i></span>'
			},
			{
				name: 'configScheme',
				xtype: 'combo',
				store : configSchemeStore,
				valueField : 'configScheme',
				displayField : 'configScheme',
				queryMode : 'local',
				forceSelection : true,
				boxLabelAlign: 'after',
				fieldLabel: 'Config Scheme',
				margin: '0 0 15 50',
				labelStyle : "width:200px;",
				afterLabelTpl: 'Choose Config Scheme'
			}
		];
	},

	showMask: function(msg) {
		if ( app.getEl() ) { 
			app.getEl().unmask();
			app.getEl().mask(msg);
		}
	},

	hideMask: function() {
		app.getEl().unmask();
	}
});
