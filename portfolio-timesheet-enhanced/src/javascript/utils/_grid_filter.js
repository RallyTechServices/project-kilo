/*!
 * Ext JS GridFilter plugin v0.1
 * https://github.com/roberto-rodriguez/ExtJs_GridFilterPlugin
 *
 *
 * Copyright 2016 Roberto Rodriguez
 * Licensed under GNU General Public License v3.
 * http://www.gnu.org/licenses/
 * 
 * 
 * @class Ext.ux.grid.GridFilter
 * @extends Ext.AbstractPlugin
 * 
 * Grid plugin that adds filtering row below grid header.
 * Allows remote filtering, supports pagination grids.
 * 
 * To add filtering to column, define "filter" property in the column configuration
 * 
 * 
 * <b>What it does?</b>
 * When the user adds criterias to the filter and hits enter,
 * The plugin reload the grid, including in the query params the values of the filters
 * 
 * The values are collected just for the filters that are not empty,
 *  and are sent to the server in the format:
 *   dataIndex:VALUE    // Example  firstName: 'Roberto'
 *   
 *   
 * 
 Example:
 
 var grid = new Ext.grid.GridPanel({
 columns: [
 {
 text: "User ID",
 dataIndex: 'userId', 
 filter: true
 },
 {
 text: "First Name",
 dataIndex: 'firstName', 
 filter: true
 },
 {
 text: "First Name",
 dataIndex: 'firstName', 
 filter: lastName
 }
 ],
 plugins:[{ptype:"gridFilter"}]
 ...
 });
 */

Ext.define('Ext.ux.grid.GridFilter', {
    extend: 'Ext.AbstractPlugin',
    alias: 'plugin.gridFilter',
    init: function (grid) {
        var me = this;
        grid.relayEvents(grid.getStore(), ['viewready', 'load', 'beforeload', 'sortchange','resize']);
        grid.addListener('beforeload', me.onBeforeLoad);
        grid.addListener('viewready', me.storeload);
        grid.addListener('load', me.storeload);
        grid.addListener('sortchange', me.storeload);
        grid.addListener('resize', me.storeload);
    },
    storeload: function () {
        console.log('storeload');
        var me = this;
        var body = me.body.dom;

        var table = body.getElementsByClassName('x-grid-table')[0];

        if (!table) {
            return;
        }

        var tbody = table.getElementsByTagName('tbody')[0];

        var tr1 = tbody.childNodes[0];

        if (tr1) {
            me['tr1'] = tr1;
        } else {
            if (me['tr1']) {
                tr1 = me['tr1'];
            } else {
                return;
            }
        }

        if (tr1.classList.contains('ux-grid-filter')) {
            return;
        }

        var newTr = document.createElement('tr');
        newTr.setAttribute("class", "ux-grid-filter");

        for (var i = 0; i < tr1.childNodes.length; i++) {

            var td = document.createElement('td');

            td.setAttribute("class", "x-grid-cell-special");
            td.setAttribute("style", "border: solid gray 1px;");

            if (me.columns[i].initialConfig.filter) {
                td.setAttribute("style", "width:100%;padding:2px 5px;border: solid gray 1px;");

                var input = document.createElement('input');
                input.setAttribute("style", "width:100%");
                input.setAttribute("name", me.columns[i].initialConfig.dataIndex);

                if (me.filters && me.filters[me.columns[i].initialConfig.dataIndex]) {
                    input.value = me.filters[me.columns[i].initialConfig.dataIndex];
                }

                input.onkeyup = function (event) {
                    if (event.keyCode === 13) {
                        var tr = event.target.parentNode.parentNode;

                        var searchParams = {};

                        for (var j = 0; j < tr.childNodes.length; j++) {
                            if (tr.childNodes[j].childNodes[0] && tr.childNodes[j].childNodes[0].value) {
                                searchParams[tr.childNodes[j].childNodes[0].name] = tr.childNodes[j].childNodes[0].value;
                            }
                        }
                        me['filters'] = searchParams;

                        var clonedSearchParams = {//for avoid include start and page in the global var
                            start: 0,
                            page: 1
                        };

                        for (var key in searchParams) {
                            clonedSearchParams[key] = searchParams[key];
                        }

                        me.store.load({params: clonedSearchParams});
                        me.store.currentPage = 1;
                    }
                };
                td.appendChild(input);
            }
            newTr.appendChild(td);
        }

        if (tbody.childNodes.length > 0) {
            tbody.insertBefore(newTr, tr1);
        } else {
            tbody.appendChild(newTr);
        }

    },
    onBeforeLoad: function (store, operation, eOpts) {
        var me = this;

        if (me.filters) {
            store.getProxy().extraParams = me.filters;
        }

        if (!me['pageSize']) {
            me['pageSize'] = --store.pageSize;
            store.getProxy().extraParams['limit'] = me['pageSize'];
        }
    }
});