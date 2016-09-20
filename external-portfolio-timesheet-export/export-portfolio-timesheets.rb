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
# ------------------------------------------------------------------------------
# c_DefaultSAPSubOperation


def check_usage()

  ARGV << '-h' if ARGV.empty?

  @options = OpenStruct.new
  optparse = OptionParser.new do |opts|
    opts.banner = "Usage: export-portfolio-timesheets.rb [options]"
    opts.separator ""
    opts.separator "Specific options:"
    opts.on('-f', '--file auth_file', String, 'Authorization file') { |o| @options.auth_file = o }
    opts.on('-s', '--start_date start_date', String, 'Enter start date, if not given previous Monday is taken as start date') { |o| @options.start_date = o }
    opts.on('-e', '--end_date end_date', String, 'Enter end date, if not given yesterday is taken as end date') { |o| @options.end_date = o }
    opts.on('-m', '--mode export_mode', String, 'Enter export mode. email or regular. Default is regular') { |o| @options.export_mode = o }

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

  if !FileTest.exist?(@options.auth_file)
    puts 
    puts "Authorization file #{@options.auth_file} does not exist"
    puts 
    exit 1
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


#
# (((DateVal >= "2015-09-12T00:00:00-04:00") AND (DateVal <= "2016-09-11T00:00:00-04:00")) AND (Hours > 0))
#((((DateVal >= #{start_date}) AND (DateVal <= #{end_date})) AND (Hours > 0)) AND (TimeEntryItem.Project.c_KMDTimeregistrationIntegration != "No"))

def get_time_values
  if(@options.end_date.nil?)
    end_date = Date.today - 1 # yesterday 
  else
    begin
      end_date = Date.parse(@options.end_date)
    rescue ArgumentError
      puts "InvalidArgument: Incorrect end date format. Please enter date as YYYY-MM-DD"
      puts 
      exit 1
    end
  end

  puts "start date given in argument #{@options.start_date}"

  integration = "No"

  if(@options.start_date.nil?)
    start_date = date_of_prev("Monday")
  else
    begin
      start_date = Date.parse(@options.start_date)
    rescue ArgumentError
      puts "InvalidArgument: Incorrect start date format. Please enter date as YYYY-MM-DD"
      puts 
      exit 1
    end
  end
  query = RallyAPI::RallyQuery.new
  query.type = "TimeEntryValue"
  #query.fetch = true
  query.fetch = "Name,FormattedID,TimeEntryItem,TimeEntryValueObject,TimeEntryItemObject,User,UserObject,WorkProduct,Requirement,Parent,PortfolioItem,Task,Artifact,Hierarchy,TypePath,_type,UserObject,UserName,TaskDisplayString,ProjectDisplayString,WorkProductDisplayString,c_SAPNetwork,c_SAPProject,c_SAPSubOperation,c_SAPOperation,Hours,ObjectID,DateVal,c_KMDEmployeeID,Project,c_KMDTimeregistrationIntegration,Owner,EmailAddress,c_DefaultSAPSubOperation" #true

  query.limit = 999999
  query.page_size = 2000
  query.project = nil
  query.query_string = "((((DateVal >= #{start_date}) AND (DateVal <= #{end_date})) AND (Hours > 0)) AND (TimeEntryItem.Project.c_KMDTimeregistrationIntegration != #{integration}))"
  @rally.find(query)
end

def add_time_entry_to_time_values(time_values)
  rows = []
  time_values.each do |time_value|
    time_entry_item = time_value["TimeEntryItem"]
    time_entry_item.read
    time_entry_project = time_entry_item["Project"]
    time_entry_project.read
    #TODO check if owner is not null and handle
    time_entry_project_owner = time_entry_project["Owner"]
    time_entry_project_owner.read
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
  parent_field = get_parent_field(item)

#  puts "Item: #{item['FormattedID']}"
#  puts "  Field: #{parent_field}"
  parent = item[parent_field]
  
  if parent.nil?
    return hierarchy
  end
  parent.read

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
  return row["Artifact"][field]
  # row["Artifact"].each do |artifact|
  #   puts artifact
  #   puts "\n"
  #   if value.nil? 
  #     value = artifact[field]
  #   end
  # end
  # return value
end
   
def get_so_field_value(row, field)
  value = nil
  if row["TimeEntryProjectObject"]["c_KMDTimeregistrationIntegration"] == "Yes with suboperation substitution"
    value = row["UserObject"]["c_DefaultSAPSubOperation"]
  else
    value = row["Artifact"][field]
  end

  return value
  # row["Artifact"].each do |artifact|
  #   puts artifact
  #   puts "\n"
  #   if value.nil? 
  #     value = artifact[field]
  #   end
  # end
  # return value
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
    if row["TimeEntryProjectObject"]["c_KMDTimeregistrationIntegration"] != "No"
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
        'ProjectOwnerEmail' => row["TimeEntryProjectOwnerObject"]["EmailAddress"],
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
          }];
end

def get_header(columns)
  heads = []
  columns.each do |column|
    heads.push(escape_text_for_csv(column['text']))
  end
  return heads
end

def get_csv(rows,error)
  columns = get_columns()
  csv_array = [get_header(columns)]
  rows.each do |row|
    if !error || !is_valid(row)
      row_csv_array = []
      columns.each do |column|
        field = column['dataIndex']
        row_csv_array.push(escape_text_for_csv(row[field]))
      end
      csv_array.push(row_csv_array)
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
  csv = get_csv(rows,true)
  filename = "SAPErrors_#{@time_now}.csv"
  puts "Writing to #{filename}"
  CSV.open("#{filename}", "wb") do |csv_file|
    csv.each do |csv_row|
      csv_file << csv_row
    end
  end
  

  if (@options.export_mode == "email")

    csv_string = CSV.generate do |csv_str|
      csv.each do |csv_row|
        csv_str << csv_row
      end
    end

    send_email(filename, csv_string,$to_address)
  end
end


def sap_headers_xml(rows)
  filename = "E1CATS_INSERT_#{@time_now}.xml"
  
  puts "Writing to #{filename}"  


  builder = Nokogiri::XML::Builder.new do |xml|
    xml.E1CATS_INSERT {
      rows.each do |row|
        if is_valid(row)  
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
        if is_valid(row)   
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
            xml.EXTAPPLICATION "RALLY"
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
        if is_valid(row)     
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

def is_valid(row)
  if (row['c_SAPNetwork'] != nil) && (row['c_SAPOperation'] != nil) && (row['c_KMDEmployeeID'] != nil)
    return true
  else
    return false
  end
end

def date_of_prev(day)
  date  = Date.parse(day)
  delta = date < Date.today ? 0 : 7
  date - delta
end

def send_email(filename,data,to_address)
  #puts data
  Mail.defaults do
    delivery_method :smtp, address: $smtp_host, port: $smtp_port
  end

  mail = Mail.new do
    from     $from_address
    to       to_address
    subject  $email_subject
    body     $email_body
    add_file :filename => filename, :content => data
  end

  mail.deliver!

end

## - start here -
@time_now = Time.new.strftime("%Y_%m_%d_%H_%M_%S")
check_usage()
connect_to_rally()
pi_types = get_pi_types()

puts "Fetching Time Values"
time_values = get_time_values()
rows = add_time_entry_to_time_values(time_values)

rows = add_users_to_time_values(rows)
rows = add_artifact_to_time_values(rows)

rows = convert_to_output_array(rows,pi_types)

export_csv(rows)
errors_csv(rows)
sap_headers_xml(rows)
sap_data_xml(rows)
sap_trailer_xml(rows)

puts "Done!"
