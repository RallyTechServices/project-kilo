Ext.define("GridExporter", {
    //dateFormat : 'Y-m-d g:i',
    dateFormat: 'Y-m-d',

    inheritableStatics: {
        XmlFileHeader: '<?xml version="1.0"?>',
        XmlFileExtension: '.xml'
    },

    // _downloadFiles: function(files) {

    //     Ext.Array.each(files)

    //     if (files.length) {
    //         var data = files.pop();
    //         var format = files.pop();
    //         var file = files.pop();

    //         var href = "<a href='" + format + "," + encodeURIComponent(data) + "' download='" + file + "'></a>";

    //         var ml = Ext.DomHelper.insertAfter(window.document.getElementById('tsGrid'), href);
    //         ml.click();
    //         //            ml.remove(); //Leaves them behind without this, but there is a timing issue: from click to remove.
    //         this._downloadFiles(files);
    //     }
    // },

    exportCSV: function(grid) {
        var data = this._getCSV(grid, false);
        // fix: ' character was causing termination of csv file
        data = data.replace(/\'/g, "");
        // this._downloadFiles(
        //     [
        //         'export.csv', 'data:text/csv;charset=utf8', data
        //     ]
        // );
        Rally.technicalservices.FileUtilities.saveCSVToFile(data,'export.csv');
    },

    _XMLIndent: function(index, tag, leaf, data) {
        if (leaf === true)
            data = _.escape(data);

        var text = '\n';
        for (var i = 0; i < index; i++) text += '\t';
        text += '<' + tag + '>';
        text += data;
        if (!leaf) {
            text += '\n';
            for (i = 0; i < index; i++) text += '\t';
        }
        text += '</' + tag + '>';
        return text;

    },

    _addSAPTrailerFile: function(data) {

        var file = 'E1BPCATS8';
        var format = 'data:text/text;charset=utf8';
        var text = this.self.XmlFileHeader;

        text += "\n<" + file + ">";
        _.each(data, function(record) {
            if (record.get('c_SAPNetwork') && record.get('c_SAPOperation') && record.get('c_KMDEmployeeID')) {
                text += this._XMLIndent(1, 'Datarow', false,
                    this._XMLIndent(2, 'GUID', true, record.get('ObjectID')) +
                    this._XMLIndent(2, 'ROW', true, '1') +
                    this._XMLIndent(2, 'FORMAT_COL', true, '*') +
                    // this._XMLIndent(2, 'TEXT_LINE', true, '')
                    this._XMLIndent(2, 'TEXT_LINE', true, record.get('TaskDisplayString') || record.get('WorkProductDisplayString') || '')
                );
            }
        }, this);

        text += "</" + file + ">\n";
        file += this.self.XmlFileExtension;
        return Rally.technicalservices.FileUtilities.saveXMLToFile(text,file); //[file, format, text];
    },

    _addSAPHeaderFile: function(data) {

        var file = 'E1CATS_INSERT';
        var format = 'data:text/text;charset=utf8';
        var text = this.self.XmlFileHeader;

        text += "\n<" + file + ">";
        _.each(data, function(record) {
            if (record.get('c_SAPNetwork') && record.get('c_SAPOperation') && record.get('c_KMDEmployeeID')) {
                text += this._XMLIndent(1, 'Datarow', false,
                    this._XMLIndent(2, 'GUID', true, record.get('ObjectID')) +
                    this._XMLIndent(2, 'PROFILE', true, record.get('c_KMDEmployeeID') || '') +
                    this._XMLIndent(2, 'TEXT_FORMAT_IMP', true, 'ITF')
                );
            }
        }, this);

        text += "</" + file + ">\n";
        file += this.self.XmlFileExtension;
        return Rally.technicalservices.FileUtilities.saveXMLToFile(text,file); //[file, format, text];
    },

    _addSAPDataFile: function(data,xmlConfig) {
        console.log('xmlConfig>>>>>',xmlConfig);
        var file = 'E1BPCATS1';
        var format = 'data:text/text;charset=utf8';
        var text = this.self.XmlFileHeader;

        text += "\n<" + file + ">";
        _.each(data, function(record) {
            if (record.get('c_SAPNetwork') && record.get('c_SAPOperation') && record.get('c_KMDEmployeeID')) {
                text += this._XMLIndent(1, 'Datarow', false,
                    this._XMLIndent(2, 'GUID', true, record.get('ObjectID') || '') +
                    this._XMLIndent(2, 'WORKDATE', true, record.get('Date')) /*Ext.Date.format(new Date(record.get('Date')), 'Ymd')) */ +
                    this._XMLIndent(2, 'EMPLOYEENUMBER', true, record.get('c_KMDEmployeeID') || '') +
                    this._XMLIndent(2, 'ACTTYPE', true, '1') +
                    this._XMLIndent(2, 'NETWORK', true, record.get('c_SAPNetwork') || '') +
                    this._XMLIndent(2, 'ACTIVITY', true, record.get('c_SAPOperation') || '') +
                    (record.get('c_SAPSubOperation') ? this._XMLIndent(2, 'SUB_ACTIVITY', true, record.get('c_SAPSubOperation')) : '') +
                    this._XMLIndent(2, 'CATSHOURS', true, record.get('Hours')) +
                    this._XMLIndent(2, 'UNIT', true, 'H') +
                    this._XMLIndent(2, 'SHORTTEXT', true, record.get('TaskDisplayString') || record.get('WorkProductDisplayString') || '') +
                    (xmlConfig.extApplication ? this._XMLIndent(2, 'EXTAPPLICATION', true, xmlConfig.extApplicationValue ) : '') + 
                    this._XMLIndent(2, 'LONGTEXT', true, 'X')
                );
            }
        }, this);
        text += "</" + file + ">\n";
        file += this.self.XmlFileExtension;
        return Rally.technicalservices.FileUtilities.saveXMLToFile(text,file); //[file, format, text];

    },

    _addSAPErrorsFile: function(grid) {
        var file = 'SAPErrors.csv';
        var format = 'data:text/csv;charset=utf8';

        var text = this._getCSV(grid, true);
        if (text) return Rally.technicalservices.FileUtilities.saveCSVToFile(text,file);
        else return null;
    },

    exportSAPXML: function(grid,xmlConfig) {

        var filesToSave = [];

        if (grid && grid.store && grid.store.data) {
            var data = grid.store.data.items;
            var errors = this._addSAPErrorsFile(grid);

            //            if (errors) {
            //this._downloadFiles(errors);
            //            }
            //            else {
            //this._downloadFiles(filesToSave.concat(
                this._addSAPHeaderFile(data),
                this._addSAPDataFile(data,xmlConfig),
                this._addSAPTrailerFile(data)
            //));
            //            }
        }

    },

    _escapeForCSV: function(string) {
        string = "" + string;
        if (string.match(/,/)) {
            if (!string.match(/"/)) {
                string = '"' + string + '"';
            } else {
                string = string.replace(/,/g, ''); // comma's and quotes-- sorry, just lose the commas
            }
        }
        return string;
    },

    _getFieldText: function(fieldData, record, col, index) {
        var text;

        if (fieldData === null || fieldData === undefined) {
            text = '';

        } else if (fieldData._refObjectName && !fieldData.getMonth) {
            text = fieldData._refObjectName;

        } else if (fieldData instanceof Date) {
            text = Ext.Date.format(fieldData, this.dateFormat);

        }
        /*else if (!fieldData.match) { // not a string or object we recognize...bank it out
                   text = '';
               } */
        else {
            text = fieldData;
        }

        return text;
    },

    _getFieldTextAndEscape: function(fieldData, record, col, index) {
        var string = this._getFieldText(fieldData, record, col, index);

        return this._escapeForCSV(string);
    },

    // have to add the colIdx to the count of locked columns
    fixedColumnCount: function(columns) {
        var cols = _.filter(columns, function(c) {
            return c !== undefined && c !== null && c.locked === true;
        });
        return cols.length;
    },

    _getCSV: function(grid, onlyErrors) {
        var cols = grid.columns;
        var store = grid.store;
        var hdrData = '';
        var rowData = '';
        var valid = true;

        var that = this;
        Ext.Array.each(cols, function(col, index) {
            // Ext.Array.each(sortedCols, function(col, index) { 
            // console.log(col);
            if (col.hidden !== true) {
                // fix the issue with the "SYLK" warning in excel by prepending "Item" to the ID column
                var colLabel = col.dataIndex;
                //                var colLabel = (index === 0 ? "Item " : "") + col.dataIndex;
                colLabel = colLabel.replace(/<br\/?>/, '');
                hdrData += that._getFieldTextAndEscape(colLabel) + ',';
            }
        });
        hdrData += "\n";

        _.each(store.data.items, function(record, i) {
            valid = record.get('c_SAPNetwork') && record.get('c_SAPOperation') && record.get('c_KMDEmployeeID');
            if ((!onlyErrors) || (!valid)) {
                Ext.Array.each(cols, function(col, index) {

                    if (col.hidden !== true) {
                        var fieldName = col.dataIndex;
                        var text = record.get(fieldName);
                        rowData += that._getFieldTextAndEscape(text, record, col, index) + ',';
                    }
                });
                rowData += "\n";
            }
        });

        return hdrData + rowData;
    }
});