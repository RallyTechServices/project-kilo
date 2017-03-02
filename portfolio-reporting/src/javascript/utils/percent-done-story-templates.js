Ext.define('Rally.ui.renderer.template.progressbar.StoryPercentDoneTemplate', {
    requires: [
        'Rally.util.HealthColorCalculator'
    ],
    extend: 'Rally.ui.renderer.template.progressbar.ProgressBarTemplate',

    config: {
        /**
         * @cfg {String}
         * define a height if necessary to fit where it's being used
         */
        height:'15px',

        calculateColorFn: function(recordData) {
            var today = new Date();
            var config = {
                percentComplete: recordData[this.percentDoneName],
                startDate: recordData[this.startDateField] || today,
                endDate: recordData[this.endDateField] || today,
                asOfDate: today
            };

            config.inProgress = config.percentComplete > 0;
            return Rally.util.HealthColorCalculator.calculateHealthColor(config).hex;
        },

        isClickable: true,
        /**
         * @cfg {Boolean}
         * If the percent done is 0%, do not show the bar at all
         */
        showOnlyIfInProgress: false

    },

    constructor: function(config) {
        this.initConfig(config);
        return this.callParent(arguments);
    }
});

/**
 * The Ext.XTemplate used to render the percent done component and column in the grid.
 */
Ext.define('Rally.ui.renderer.template.progressbar.StoryPercentDoneByStoryPlanEstimateTemplate', {
    requires: [],
    extend: 'Rally.ui.renderer.template.progressbar.StoryPercentDoneTemplate',

    config: {
        /**
         * @cfg {String}
         * sometimes it's necessary to name the variable used as the percent done replacement in the template,
         * like in a grid when a record is used to render the template.
         */
        percentDoneName: 'PercentDoneByStoryPlanEstimate',

        /**
         * @cfg {Function}
         * A function that should return true to show a triangle in the top right to denote something is missing.
         * Defaults to:
         *      function(){ return false; }
         */
        showDangerNotificationFn: function (recordData) {
            var summary = recordData._summary || {};

            return !summary.endDate || !summary.startDate ||
                summary.unestimatedLeafStories > 0;
        }
    }
});

Ext.define('Rally.ui.renderer.template.progressbar.StoryPercentDoneByStoryCountTemplate', {
    requires: [],
    extend: 'Rally.ui.renderer.template.progressbar.StoryPercentDoneTemplate',

    config: {

        /**
         * @cfg {String}
         * sometimes it's necessary to name the variable used as the percent done replacement in the template,
         * like in a grid when a record is used to render the template.
         */
        percentDoneName: 'PercentDoneByStoryCount',
        /**
         * @cfg {Function}
         * A function that should return true to show a triangle in the top right to denote something is missing.
         * Defaults to:
         *      function(){ return false; }
         */
        showDangerNotificationFn: function (recordData) {
            var summary = recordData._summary || {};
            return !summary.endDate || !summary.startDate;
        }
    }
});