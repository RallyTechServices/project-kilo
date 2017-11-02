require "rally_api"
require "CSV"
require "nokogiri"
require "mail"
require "optparse"
require "ostruct"
require "date"

#!/usr/bin/env ruby
# ------------------------------------------------------------------------------
# SCRIPT:
#       export-portfolio-timesheets.rb
#
# PURPOSE:
#       Used to export portfolio time sheets weekly/ monthly and email as necessary.
#       type export-portfolio-timesheets.rb -h to get help.
#
# PREREQUISITES:
#       - Ruby version 1.9.3 or later.
#
# sample command for testing external-portfolio-timesheet-export rajan08$ ruby export-portfolio-timesheets.rb -f auth.rb -k SAP-Keys.csv -s 20160601 -e 20171001 -m email -t email-template.txt
#
# ------------------------------------------------------------------------------

@parents_hash = {}

def check_usage()

  ARGV << '-h' if ARGV.empty?

  @options = OpenStruct.new
  optparse = OptionParser.new do |opts|
    opts.banner = "Usage: export-portfolio-timesheets.rb [options]"
    opts.separator ""
    opts.separator "Specific options:"
    opts.on('-f', '--file auth_file', String, 'Authorization file') { |o| @options.auth_file = o }
    opts.on('-k', '--keys_file keys_file', String, 'SAP Keys CSV file') { |o| @options.keys_file = o }
    opts.on('-t', '--template_file template_file', String, 'Email Template file') { |o| @options.template_file = o }
    opts.on('-s', '--start_date start_date', String, 'Enter start date, if not given previous Monday is taken as start date') { |o| @options.start_date = o }
    opts.on('-e', '--end_date end_date', String, 'Enter end date, if not given yesterday is taken as end date') { |o| @options.end_date = o }
    opts.on('-m', '--mode export_mode', String, 'Enter export mode. email, pv or regular. Default is regular') { |o| @options.export_mode = o }

    #{ |o| @options.mode = o }
    opts.on("-h", "--help", "Prints this help") do
      puts opts
      exit
    end
  end

  begin
    optparse.parse!
  rescue OptionParser::InvalidOption, OptionParser::MissingArgument, OptionParser::InvalidArgument      #
    puts $!.to_s                                                           # Friendly output when parsing fails
    puts optparse                                                          #
    exit                                                                   #
  end

  if @options.auth_file.nil? || !FileTest.exist?(@options.auth_file)
    puts
    puts "Authorization file #{@options.auth_file} does not exist"
    puts
    exit 1
  end

  if (@options.export_mode == "email" || @options.export_mode == "pv"  )
    if @options.template_file.nil? || !FileTest.exist?(@options.template_file)
      puts
      puts "Email Template file #{@options.template_file} does not exist"
      puts
      exit 1
    end
  end

  require "./#{@options.auth_file}"
end

def connect_to_rally
  headers = RallyAPI::CustomHttpHeader.new(
    :name   => "Export Portfolio Timesheets",
    :vendor => "Rally Technical Services",
    :version=> "0.1"
  )

  config = {
    :base_url   => "#{$rally_server}/slm",
    :api_key    => $rally_api_key,
    :version    => "v2.0",
    :headers    => headers,
    :workspace  => $rally_workspace
  }
  puts "Connecting to #{$rally_server}"
  @rally = RallyAPI::RallyRestJson.new(config)
end

def get_pi_types
  query = RallyAPI::RallyQuery.new
  query.type = "TypeDefinition"
  query.fetch = true
  query.query_string = "( Ordinal != -1 )"
  query.order = "Ordinal"

  results = @rally.find(query)

  types = []
  results.each do |result|
    result.read
    types.push(result)
  end

  return types
end


def get_time_values
  if(@options.end_date.nil?)
    end_date = Date.today - 1 # yesterday
    end_date.strftime("%F")
  else
    begin
      end_date = Date.parse(@options.end_date)
    rescue ArgumentError
      puts "InvalidArgument: Incorrect end date format. Please enter date as YYYY-MM-DD"
      puts
      exit 1
    end
  end

  integration = "No"

  if(@options.start_date.nil?)
    start_date = date_of_prev("Monday")
    # #if a week contains a new month, the export is done twice. This conidition makes sure the 2nd export done at the end of the weeks starts from the begining of the month.
    first_day_of_month = Date.new(Date.today.year,Date.today.month,1)
    first_day_of_month.strftime("%F")
    #If the first day of the month is a Saturday or Sunday, export the whole week. 
    day_fdom = first_day_of_month.strftime("%A").downcase

    if(start_date < first_day_of_month && day_fdom != 'sunday' && day_fdom != 'saturday' && end_date >= first_day_of_month)
        start_date = first_day_of_month
    end
  else
    begin
      start_date = Date.parse(@options.start_date)
    rescue ArgumentError
      puts "InvalidArgument: Incorrect start date format. Please enter date as YYYY-MM-DD"
      puts
      exit 1
    end
  end

  puts "start date  #{start_date}"
  puts "end date  #{end_date}"

  #adjusting the dates and the query string to include start and end date.
  start_date = start_date - 1
  end_date = end_date + 1

  start_date = start_date.to_s + "T00:00:00.000Z"
  end_date = end_date.to_s + "T00:00:00.000Z"



  query = RallyAPI::RallyQuery.new
  query.type = "TimeEntryValue"
  #query.fetch = true
  query.fetch = "ObjectID, Name,FormattedID,TimeEntryItem,TimeEntryValueObject,TimeEntryItemObject,User,UserObject,WorkProduct,Requirement,Parent,PortfolioItem,Task,Artifact,Hierarchy,TypePath,_type,UserObject,UserName,TaskDisplayString,ProjectDisplayString,WorkProductDisplayString,c_SAPNetwork,c_SAPProject,c_SAPSubOperation,c_SAPOperation,Hours,ObjectID,DateVal,c_KMDEmployeeID,Project,c_KMDTimeregistrationIntegration,Owner,EmailAddress,c_DefaultSAPSubOperation,CreationDate" #true

  query.limit = 999999
  query.page_size = 2000
  query.project = nil
  query.query_string = "((((DateVal > #{start_date}) AND (DateVal < #{end_date})) AND (Hours > 0)) AND (TimeEntryItem.Project.c_KMDTimeregistrationIntegration != #{integration}))"
  #puts "((((DateVal > #{start_date}) AND (DateVal < #{end_date})) AND (Hours > 0)) AND (TimeEntryItem.Project.c_KMDTimeregistrationIntegration != #{integration}))"
  @rally.find(query)
end

def add_time_entry_to_time_values(time_values)
  rows = []
  time_values.each do |time_value|
    time_entry_item = time_value["TimeEntryItem"]
    #time_entry_item.read
    #puts time_value["ObjectID"].to_s + ":" + time_value["DateVal"].to_s
    time_entry_project = time_entry_item["Project"]
    #time_entry_project.read

    time_entry_project_owner = time_entry_project["Owner"]
    # if !time_entry_project_owner.nil?
    #   time_entry_project_owner.read
    # end

    rows.push({
      "TimeEntryValueObject" => time_value,
      "TimeEntryItemObject" => time_entry_item,
      "TimeEntryProjectOwnerObject" => time_entry_project_owner,
      "TimeEntryProjectObject" => time_entry_project
    })
  end

  return rows
end

def add_users_to_time_values(rows)
  rows.each do |row|
    time_value = row["TimeEntryItemObject"]
    user = time_value["User"]
    begin
      user.read
    rescue Exception => ex
      "    Warning: #{ex.message}"
      "    Possible that this user no longer exists #{user._refObjectName}/#{user.ObjectID}"
    end
    row["UserObject"] = user
  end

  return rows
end

def get_type_from_ref(ref)
  ref_array = ref.split('/')

  oid = ref_array.pop
  type = ref_array.pop
  above = ref_array.pop

  if /portfolio/ =~ above
    return "#{above}/#{type}"
  end
  return type
end

def get_parent_field(artifact)
  type = artifact["_type"] || get_type_from_ref(artifact["_ref"])
  type.downcase!

  if type == 'task'
    return 'WorkProduct'
  end
  if type == 'defect'
    return 'Requirement'
  end
  if type =~ /portfolioitem/
    return 'Parent'
  end
  if artifact["Parent"].nil?
    return "PortfolioItem"
  end
  return "Parent"
end

def get_parents(item, hierarchy=[])
  hierarchy.push(item)

  parent_field = get_parent_field(item)

#  puts "Item: #{item['FormattedID']}"
#  puts "  Field: #{parent_field}"
  parent = item[parent_field]

  if parent.nil?
    return hierarchy
  end
  #parent.read

  parent_object_id = parent["_refObjectUUID"]
  if(@parents_hash[parent_object_id].nil?)
      parent.read
      #puts "Parent ObjectID - #{parent_object_id} - #{parent["Name"]}"
      @parents_hash[parent_object_id] = parent
  else
      parent = @parents_hash[parent_object_id]
      #puts "#{parent["c_SAPProject"]} - #{parent["Name"]}"
  end

  hierarchy.push(parent)

  hierarchy = get_parents(parent,hierarchy)

  return hierarchy
end

def add_artifact_to_time_values(rows)
  # re do rows so we can remove if it's not a valid time entry
  updated_rows = []
  rows.each do |row|
    time_value = row["TimeEntryItemObject"]
    artifact = time_value["Task"] || time_value["WorkProduct"]
    if artifact.nil?
      puts "  Warning: This is likely a project time entry."
      next
    end

    begin
      artifact.read
    rescue Exception => ex
      puts "  Warning: #{ex.message}"
      puts "    Possible that this item no longer exists #{artifact._refObjectName}/#{artifact.FormattedID}"
    end
    row["Artifact"] = artifact

    hierarchy = get_parents(artifact)
    row["Hierarchy"] = hierarchy
    updated_rows.push(row)
  end

  return updated_rows
end

# get the field value at the lowest level that has a value in that field
def get_field_value(row, field)
  value = nil

  row["Hierarchy"].each do |artifact|
    if value.nil?
      value = artifact[field]
    end
  end
  return value
end

def get_so_field_value(row, field)
  value = nil
  if row["TimeEntryProjectObject"]["c_KMDTimeregistrationIntegration"] == "Yes with suboperation substitution"
    value = row["UserObject"]["c_DefaultSAPSubOperation"]
  else
    row["Hierarchy"].each do |artifact|
      if value.nil?
        value = artifact[field]
      end
    end
  end

  return value

end

def get_type_field_value(record, pi_type, field)
  found_item = nil
  type_path = pi_type['TypePath'].downcase

  record["Hierarchy"].each do |artifact|
    type = artifact["_type"] || get_type_from_ref(artifact["_ref"])
    if type.downcase == type_path
      found_item = artifact
    end
  end
  if found_item.nil?
    return ""
  end
  return found_item[field]

end

def convert_to_output_array(rows,pi_types)
  output_rows = []
  rows.each do |row|
    if (row["TimeEntryProjectObject"]["c_KMDTimeregistrationIntegration"] == "Yes with suboperation substitution" || row["TimeEntryProjectObject"]["c_KMDTimeregistrationIntegration"] == "Yes")
      output_rows.push({
        "UserName" => row["UserObject"]["UserName"],
        "TaskDisplayString"  => row["TimeEntryItemObject"]["TaskDisplayString"],
        "ProjectDisplayString"  => row["TimeEntryItemObject"]["ProjectDisplayString"],
        "WorkProductDisplayString" => row["TimeEntryItemObject"]["WorkProductDisplayString"],
        "FeatureID"  => get_type_field_value(row, pi_types[0], "FormattedID"),
        "FeatureName" => get_type_field_value(row, pi_types[0], "Name"),
        'test'  => get_field_value(row, 'FormattedID'),
        'c_SAPProject'  => get_field_value(row, 'c_SAPProject'),
        'c_SAPNetwork'  => get_field_value(row, 'c_SAPNetwork'),
        'c_SAPOperation'  => get_field_value(row, 'c_SAPOperation'),
        'c_SAPSubOperation'  => get_so_field_value(row, 'c_SAPSubOperation'),
        'EpicID' => get_type_field_value(row, pi_types[1], "FormattedID"),
        'EpicName' => get_type_field_value(row, pi_types[1], "Name"),
        'Hours' => row["TimeEntryValueObject"]['Hours'],
        'ObjectID' => row["TimeEntryValueObject"]["ObjectID"],
        'Date' => Date.parse(row["TimeEntryValueObject"]['DateVal']).strftime("%Y%m%d"),
        'c_KMDEmployeeID' => row["UserObject"]["c_KMDEmployeeID"],
        'Hierarchy' => row["Hierarchy"],
        'ProjectOwnerEmail' => row["TimeEntryProjectOwnerObject"] ? row["TimeEntryProjectOwnerObject"]["EmailAddress"] : $to_address,
        'KMDTimeregistrationIntegration' => row["TimeEntryProjectObject"]["c_KMDTimeregistrationIntegration"],
        'DefaultSAPSubOperation' => row["UserObject"]["c_DefaultSAPSubOperation"]
      })
    end
  end
  return output_rows
end

def escape_text_for_csv(text)
  string = "#{text}"
  if string =~ /,/
    if string !~ /"/
      string = '"' + string + '"'
    else
      string.gsub!(/,/,' ')  # when both commas and quotes, remove the commas
    end
  end
  return string
end

def get_columns()
  return [{
              'text' => 'User',
              'dataIndex' => 'UserName'
          }, {
              'text' => 'Task',
              'dataIndex' => 'TaskDisplayString'
          }, {
              'text' => 'Project',
              'dataIndex' => 'ProjectDisplayString'
          }, {
              'text' => 'Work Product',
              'dataIndex' => 'WorkProductDisplayString'
          }, {
              'text' => 'Feature ID',
              'dataIndex' => 'FeatureID'
          }, {
              'text' => 'Feature Title',
              'dataIndex' => 'FeatureName'
          }, {
              'text' => 'SAP project',
              'dataIndex' => 'c_SAPProject'
          },{
              'text' => 'SAP Network',
              'dataIndex' => 'c_SAPNetwork'
          }, {
              'text' => 'SAP Operation',
              'dataIndex' => 'c_SAPOperation'
          }, {
              'text' => 'SAP Sub Operation',
              'dataIndex' => 'c_SAPSubOperation'
          }, {
              'text' => 'Epic ID',
              'dataIndex' => 'EpicID'
          }, {
              'text' => 'Epic Title',
              'dataIndex' => 'EpicName'
          }, {
              'text' => 'Hours Entered',
              'dataIndex' => 'Hours'
          }, {
              'text' => 'Unique ID',
              'dataIndex' => 'ObjectID'
          }, {
              'text' => 'Date',
              'dataIndex' => 'Date'
          }, {
              'text' => 'Employee ID',
              'dataIndex' => 'c_KMDEmployeeID'
          },
          {
              'text' => 'Project Owner Email',
              'dataIndex' => 'ProjectOwnerEmail'
          }];
end

def get_header(columns,error)
  heads = []
  columns.each do |column|
    if column['dataIndex'] != "ProjectOwnerEmail"
      heads.push(escape_text_for_csv(column['text']))
    end
  end
  if (error)
      heads.push('Reason')
  end
  return heads
end


def get_csv_from_keys(rows,error)
  columns = get_columns()
  csv_array = [get_header(columns,error)]
  rows.each do |row|
    reason = is_valid_by_keys(row)
    if !error ||  reason != "valid"
      row_csv_array = []
      columns.each do |column|
        field = column['dataIndex']
        if field != "ProjectOwnerEmail"
          row_csv_array.push(escape_text_for_csv(row[field]))
        end
      end
      row_csv_array.push(reason)
      csv_array.push(row_csv_array)
    end
  end

  return csv_array
end

def is_valid_by_keys(row)
  valid = "valid"
  if (row['c_SAPProject'] != nil) && (row['c_SAPNetwork'] != nil) && (row['c_SAPOperation'] != nil) && (row['c_KMDEmployeeID'] != nil)
    if !validate_keys(row)
      valid = $reason_1
    end
  else
    valid = $reason_2
  end
  #puts row['FeatureID'] + " : " + valid
  return valid
end

def validate_keys(row)
  if(row['c_SAPSubOperation'] != nil)
    all_sap_keys = row['c_SAPProject'].downcase + row['c_SAPNetwork'].to_s + row['c_SAPOperation'].to_s + row['c_SAPSubOperation'].to_s
    return  @sap_keys_all.include? all_sap_keys
  else
    no_so_sap_keys = row['c_SAPProject'].downcase + row['c_SAPNetwork'].to_s + row['c_SAPOperation'].to_s
    return  @sap_keys_no_so.include? no_so_sap_keys
  end
end

def get_csv(rows,error)
  columns = get_columns()
  csv_array = [get_header(columns,error)]
  rows.each do |row|
    reason = is_valid_by_keys(row)
    if !error ||  reason != "valid"
      row_csv_array = []
      columns.each do |column|
        field = column['dataIndex']
        if field != "ProjectOwnerEmail"
          row_csv_array.push(escape_text_for_csv(row[field]))
        end
      end
      if(error)
        row_csv_array.push(reason)
      end
      csv_array.push(row_csv_array)
    end
  end
  return csv_array
end


#create a map of csv_array for each owner email address
# def get_split_csv(rows,error)
#   columns = get_columns()
#   csv_array = {} 
#   rows.each do |row|
#     if !error || !is_valid(row)
#       if csv_array[row["ProjectOwnerEmail"]].nil?
#         csv_array[row["ProjectOwnerEmail"]] = [get_header(columns,error)]
#       end
#       row_csv_array = []
#       columns.each do |column|
#         field = column['dataIndex']
#         if field != "ProjectOwnerEmail"
#           row_csv_array.push(escape_text_for_csv(row[field]))
#         end
#       end
#       csv_array[row["ProjectOwnerEmail"]].push(row_csv_array)
#     end
#   end
#   return csv_array
# end

def get_split_csv_from_keys(rows,error)
  columns = get_columns()
  csv_array = {} 
  rows.each do |row|
    reason = is_valid_by_keys(row)
    if !error || reason != "valid"
      if csv_array[row["ProjectOwnerEmail"]].nil?
        csv_array[row["ProjectOwnerEmail"]] = [get_header(columns,error)]
      end
      row_csv_array = []
      columns.each do |column|
        field = column['dataIndex']
        if field != "ProjectOwnerEmail"
          row_csv_array.push(escape_text_for_csv(row[field]))
        end
      end
      row_csv_array.push(reason)
      csv_array[row["ProjectOwnerEmail"]].push(row_csv_array)
    end
  end
  return csv_array
end


def export_csv(rows)
  csv = get_csv(rows,false)
  filename = "export_#{@time_now}.csv"

  puts "Writing to #{filename}"
  CSV.open("#{filename}", "wb") do |csv_file|
    csv.each do |csv_row|
      csv_file << csv_row
    end
  end
end

def errors_csv(rows)
  #puts rows

  csv = @options.export_mode == "pv" ? get_csv_from_keys(rows,true) : get_csv(rows,true)
  #puts csv
  filename = "SAPErrors_#{@time_now}.csv"
  puts "Writing to #{filename}"
  CSV.open("#{filename}", "wb") do |csv_file|
    csv.each do |csv_row|
      csv_file << csv_row
    end
  end

  if (@options.export_mode == "email" || @options.export_mode == "pv")
    send_email(filename, rows,$to_address, @time_now)
  end
end


def sap_headers_xml(rows)
  filename = "E1CATS_INSERT_#{@time_now}.xml"

  puts "Writing to #{filename}"


  builder = Nokogiri::XML::Builder.new do |xml|
    xml.E1CATS_INSERT {
      rows.each do |row|
        #if is_valid(row)
        if (is_valid_by_keys(row) == "valid")
          xml.Datarow {
            xml.GUID row['ObjectID']
            xml.PROFILE row['c_KMDEmployeeID']
            xml.TEXT_FORMAT_IMP  "ITF"
          }
        end
      end
    }
  end

  File.write(filename, builder.to_xml)

end


def sap_data_xml(rows)
  filename = "E1BPCATS1_#{@time_now}.xml"

  puts "Writing to #{filename}"

  builder = Nokogiri::XML::Builder.new do |xml|
    xml.E1CATS_INSERT {
      rows.each do |row|
        #if is_valid(row)
        if (is_valid_by_keys(row) == "valid")
          xml.Datarow {
            xml.GUID row['ObjectID']
            xml.WORKDATE row['Date']
            xml.EMPLOYEENUMBER  row['c_KMDEmployeeID']
            xml.ACTTYPE "1"
            xml.NETWORK row['c_SAPNetwork']
            xml.ACTIVITY row['c_SAPOperation']
            xml.SUB_ACTIVITY row['c_SAPSubOperation']
            xml.CATSHOURS row['Hours']
            xml.UNIT "H"
            xml.SHORTTEXT row['TaskDisplayString'] || row['WorkProductDisplayString']
            xml.EXTAPPLICATION $extapplication ? $extapplication : "RALLY"
            xml.LONGTEXT "X"
          }
        end
      end
    }
  end

  File.write(filename, builder.to_xml)

end

def sap_trailer_xml(rows)
  filename = "E1BPCATS8_#{@time_now}.xml"

  puts "Writing to #{filename}"

  builder = Nokogiri::XML::Builder.new do |xml|
    xml.E1CATS_INSERT {
      rows.each do |row|
        #if is_valid(row)
        if (is_valid_by_keys(row) == "valid")
          xml.Datarow {
            xml.GUID row['ObjectID']
            xml.ROW "1"
            xml.FORMAT_COL  "*"
            xml.TEXT_LINE row['TaskDisplayString'] || row['WorkProductDisplayString']
          }
        end
      end
      }
    end

  File.write(filename, builder.to_xml)
end

# def is_valid(row)
#   if (row['c_SAPProject'] != nil) && (row['c_SAPNetwork'] != nil) && (row['c_SAPOperation'] != nil) && (row['c_KMDEmployeeID'] != nil)
#     return true
#   else
#     return false
#   end
# end

def date_of_prev(day)
  date  = Date.parse(day)
  delta = date < Date.today ? 0 : 7
  date - delta
end

def send_email(filename,rows,to_address,time_now)

  options = { :address              => $smtp_host,
              :port                 => $smtp_port
            }

  Mail.defaults do
    delivery_method :smtp, options
  end
  #csv = @options.export_mode == "pv" ||  @options.export_mode == "email" ? get_split_csv_from_keys(rows,true) : get_csv(rows,true)
  csv = get_split_csv_from_keys(rows,true)
  #puts csv

  csv.each do |key, array|
    csv_string = CSV.generate do |csv_str|
      array.each do |csv_row|
        csv_str << csv_row
      end
    end
    #puts data
    template_file = File.read(@options.template_file)

    mail = Mail.new do
      from     $from_address
      to       key
      subject  $email_subject + ": " + time_now
      add_file :filename => filename, :content => csv_string
      html_part do
        content_type 'text/html; charset=UTF-8'
        body  template_file
      end
    end

    mail.deliver!
  end

end

def load_keys_from_csv

  if @options.keys_file.nil? || !FileTest.exist?(@options.keys_file)
    puts
    puts "SAP Keys file #{@options.keys_file} does not exist"
    puts
    exit 1
  end

  file = @options.keys_file #"SAP-Keys.csv"

  @sap_keys_all = []
  @sap_keys_no_so = []
  CSV.foreach(file, :col_sep => ";", :return_headers => false, :encoding => 'ISO-8859-1', :quote_char => "\x00") do |row|
    @sap_keys_all << (row[0].nil? ? "" : row[0].downcase) + (row[4].nil? ? "" : row[4]) + (row[6].nil? ? "" : row[6]) + (row[8].nil? ? "" : row[8])
    @sap_keys_no_so << (row[0].nil? ? "" : row[0].downcase) + (row[4].nil? ? "" : row[4]) + (row[6].nil? ? "" : row[6])
  end
end

## - start here -
@time_now = Time.new.strftime("%Y_%m_%d_%H_%M_%S")
puts "Start Time: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"


check_usage()

load_keys_from_csv()

#puts "Time after parsing CSV file: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

connect_to_rally()
pi_types = get_pi_types()

puts "Fetching Time Values"
time_values = get_time_values()
#puts "Time after get_time_values: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

rows = add_time_entry_to_time_values(time_values)
#puts "Time after add_time_entry_to_time_values: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

rows = add_users_to_time_values(rows)
#puts "Time after add_users_to_time_values: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

rows = add_artifact_to_time_values(rows)
#puts "Time after add_artifact_to_time_values: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

rows = convert_to_output_array(rows,pi_types)
#puts "Time after convert_to_output_array: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

if(@options.export_mode == "pv")
  #send email of missing and incorrect sap keys
  puts "In post validation mode"
  errors_csv(rows)

else
  puts "In regular mode"

  export_csv(rows)
  errors_csv(rows)
  sap_headers_xml(rows)
  sap_data_xml(rows)
  sap_trailer_xml(rows)
end

puts "End time: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"
puts "Done!"
