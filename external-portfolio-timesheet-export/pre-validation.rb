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
#       pre-validation.rb
#
# PURPOSE:
#       Used to pre validate user stories/ tasks to see if they have the correct SAP info.
#       type pre-validation.rb -h to get help.
#
# PREREQUISITES:
#       - Ruby version 1.9.3 or later.
#
# ------------------------------------------------------------------------------


def check_usage()

  ARGV << '-h' if ARGV.empty?

  @options = OpenStruct.new
  optparse = OptionParser.new do |opts|
    opts.banner = "Usage: pre-validation.rb [options]"
    opts.separator ""
    opts.separator "Specific options:"
    opts.on('-f', '--file auth_file', String, 'Authorization file') { |o| @options.auth_file = o }
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

#get all Stories that doesnt have tasks and all the tasks

def get_time_values(model)
  now = Date.today
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
  query.type = model
  query.fetch = true
  #query.fetch = "Name,FormattedID,TimeEntryItem,TimeEntryValueObject,TimeEntryItemObject,User,UserObject,WorkProduct,Requirement,Parent,PortfolioItem,Task,Artifact,Hierarchy,TypePath,_type,UserObject,UserName,TaskDisplayString,ProjectDisplayString,WorkProductDisplayString,c_SAPNetwork,c_SAPProject,c_SAPSubOperation,c_SAPOperation,Hours,ObjectID,DateVal,c_KMDEmployeeID,Project,c_KMDTimeregistrationIntegration,Owner,EmailAddress,c_DefaultSAPSubOperation" #true

  query.limit = 999999
  query.page_size = 2000
  query.project = nil
  query.query_string = "(((Iteration.StartDate <= #{now}) AND (Iteration.EndDate >= #{now})) AND (Project.c_KMDTimeregistrationIntegration != #{integration}))"
  @rally.find(query)
end

def add_time_entry_to_time_values(task_values,us_values)
  rows = []
  task_values.each do |time_value|
    
    time_entry_project = time_value["Project"]
    if !time_entry_project.nil?
      time_entry_project.read
    end    
    
    time_entry_user_object =time_value["Owner"] 
    if !time_entry_user_object.nil?
      time_entry_user_object.read
    end

    time_entry_project_owner = time_entry_project["Owner"]
    if !time_entry_project_owner.nil?
      time_entry_project_owner.read
    end

    rows.push({
      "TimeEntryValueObject" => time_value,
      "UserObject" => time_entry_user_object,
      "TimeEntryProjectOwnerObject" => time_entry_project_owner,
      "TimeEntryProjectObject" => time_entry_project
    })
  end
  
  us_values.each do |time_value|

    time_entry_project = time_value["Project"]
    if !time_entry_project.nil?
      time_entry_project.read
    end    
    
    time_entry_user_object =time_value["Owner"] 
    if !time_entry_user_object.nil?
      time_entry_user_object.read
    end

    time_entry_project_owner = time_entry_project["Owner"]
    if !time_entry_project_owner.nil?
      time_entry_project_owner.read
    end

    rows.push({
      "TimeEntryValueObject" => time_value,
      "UserObject" => time_entry_user_object,
      "TimeEntryProjectOwnerObject" => time_entry_project_owner,
      "TimeEntryProjectObject" => time_entry_project
    })
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
  parent.read

  hierarchy.push(parent)
  
  hierarchy = get_parents(parent,hierarchy)
  
  return hierarchy
end

def add_artifact_to_time_values(rows)
  # re do rows so we can remove if it's not a valid time entry
  updated_rows = []
  rows.each do |row|
    #time_value = row["TimeEntryValueObject"]
    artifact =  row["TimeEntryValueObject"]
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
    value = row["UserObject"] ? row["UserObject"]["c_DefaultSAPSubOperation"]:""
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
        "UserName" => row["UserObject"] ? row["UserObject"]["UserName"] :"",
        "ProjectName"  => row["TimeEntryProjectObject"]["Name"],
        "FeatureID"  => get_type_field_value(row, pi_types[0], "FormattedID"),
        "FeatureName" => get_type_field_value(row, pi_types[0], "Name"),
        'test'  => get_field_value(row, 'FormattedID'),
        'c_SAPProject'  => get_field_value(row, 'c_SAPProject'),
        'c_SAPNetwork'  => get_field_value(row, 'c_SAPNetwork'),
        'c_SAPOperation'  => get_field_value(row, 'c_SAPOperation'),
        'c_SAPSubOperation'  => get_so_field_value(row, 'c_SAPSubOperation'),
        'EpicID' => get_type_field_value(row, pi_types[1], "FormattedID"),
        'EpicName' => get_type_field_value(row, pi_types[1], "Name"),
        'ObjectID' => row["TimeEntryValueObject"]["ObjectID"],
        'FormattedID' => row["TimeEntryValueObject"]["FormattedID"],
        'Name' => row["TimeEntryValueObject"]["Name"],
        'Date' => Date.parse(row["TimeEntryValueObject"]['CreationDate']).strftime("%Y%m%d"),
        'c_KMDEmployeeID' => row["UserObject"] ? row["UserObject"]["c_KMDEmployeeID"]:"",
        'Hierarchy' => row["Hierarchy"],
        'ProjectOwnerEmail' => row["TimeEntryProjectOwnerObject"] ? row["TimeEntryProjectOwnerObject"]["EmailAddress"] : $to_address,
        'KMDTimeregistrationIntegration' => row["TimeEntryProjectObject"]["c_KMDTimeregistrationIntegration"],
        'DefaultSAPSubOperation' => row["UserObject"] ? row["UserObject"]["c_DefaultSAPSubOperation"]:""
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
  return [
          {
              'text' => 'Formatted ID',
              'dataIndex' => 'FormattedID'
          },     
          {
              'text' => 'Name',
              'dataIndex' => 'Name'
          },
          {
              'text' => 'SAP project',
              'dataIndex' => 'c_SAPProject'
          },
          {
              'text' => 'SAP Network',
              'dataIndex' => 'c_SAPNetwork'
          }, 
          {
              'text' => 'SAP Operation',
              'dataIndex' => 'c_SAPOperation'
          }, 
          {
              'text' => 'SAP Sub Operation',
              'dataIndex' => 'c_SAPSubOperation'
          }, 
          {
              'text' => 'Project',
              'dataIndex' => 'ProjectName'
          },          
          ];
end

def get_header(columns)
  heads = []
  columns.each do |column|
    if column['dataIndex'] != "ProjectOwnerEmail"
      heads.push(escape_text_for_csv(column['text']))
    end
  end
  heads.push('Reason')
  return heads
end

def get_csv(rows,error)
  columns = get_columns()
  csv_array = [get_header(columns)]
  rows.each do |row|
    reason = is_valid(row)
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


#create a map of csv_array for each owner email address
# csv_array = {"1st@email.address" => [[get_header(columns)],[row_values]],"2nd@email.address" => [[get_header(columns)],[row_values]]}
def get_split_csv(rows,error)
  columns = get_columns()
  csv_array = {} #[get_header(columns)]
  rows.each do |row|
    reason = is_valid(row)
    if !error ||  reason != "valid"
      if csv_array[row["ProjectOwnerEmail"]].nil?
        csv_array[row["ProjectOwnerEmail"]] = [get_header(columns)]
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
    send_email(filename, rows,$to_address, @time_now)
  end
end

def is_valid(row)
  valid = "valid"
  if (row['c_SAPProject'] != nil) && (row['c_SAPNetwork'] != nil) && (row['c_SAPOperation'] != nil) && (row['c_KMDEmployeeID'] != nil)
    if !validate_keys(row)
      valid = $reason_1
    end 
  else
    valid = $reason_2
  end
  return valid
end

def validate_keys(row)
  return  (@network.include? row['c_SAPNetwork']) && (@project.include? row['c_SAPProject']) && (@operation.include? row['c_SAPOperation'])
end

def date_of_prev(day)
  date  = Date.parse(day)
  delta = date < Date.today ? 0 : 7
  date - delta
end

def send_email(filename,rows,to_address,time_now)
  Mail.defaults do
    delivery_method :smtp, address: $smtp_host, port: $smtp_port
  end

  csv = get_split_csv(rows,true)
  #puts csv

  csv.each do |key, array|
    csv_string = CSV.generate do |csv_str|
      array.each do |csv_row|
        csv_str << csv_row
      end
    end
    #puts data

    mail = Mail.new do
      from     $from_address
      to       key
      subject  $email_subject + ": " + time_now
      body     File.read('email-template.txt')#$email_body
      add_file :filename => filename, :content => csv_string
    end

    mail.deliver!  
  end

end

def load_keys_from_csv

  file = "SAP-Keys.csv"

  @project = []
  @network = []
  @operation = []
  @sub_operation = []

  CSV.foreach(file, :col_sep => ",", :return_headers => false) do |row|
    @project << row[0]
    @network << row[1]
    @operation << row[2]
    @sub_operation << row[3]
  end

end

## - start here -
@time_now = Time.new.strftime("%Y_%m_%d_%H_%M_%S")
check_usage()
connect_to_rally()
pi_types = get_pi_types()

puts "Fetching Time Values"
task_values = get_time_values("task")
us_values = get_time_values("hierarchicalrequirement")

rows = add_time_entry_to_time_values(task_values,us_values)
rows = add_artifact_to_time_values(rows)

load_keys_from_csv()

rows = convert_to_output_array(rows,pi_types)

errors_csv(rows)

puts "Done!"
