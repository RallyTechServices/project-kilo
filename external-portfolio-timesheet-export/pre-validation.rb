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

@parents_hash = {}

def check_usage()

  ARGV << '-h' if ARGV.empty?

  @options = OpenStruct.new
  optparse = OptionParser.new do |opts|
    opts.banner = "Usage: pre-validation.rb [options]"
    opts.separator ""
    opts.separator "Specific options:"
    opts.on('-f', '--file auth_file', String, 'Authorization file') { |o| @options.auth_file = o }
    opts.on('-k', '--keys_file keys_file', String, 'SAP Keys CSV file') { |o| @options.keys_file = o }
    opts.on('-t', '--template_file template_file', String, 'Email Template file') { |o| @options.template_file = o }
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

  if @options.auth_file.nil? || !FileTest.exist?(@options.auth_file)
    puts
    puts "Authorization file #{@options.auth_file} does not exist"
    puts
    exit 1
  end

  if (@options.export_mode == "email")
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


#get all Stories that doesnt have tasks and all the tasks

def get_time_values(model)
  now = Date.today

  integration = "No"

  query = RallyAPI::RallyQuery.new
  query.type = model
  #query.fetch = true
  query.fetch = "ObjectID,Name,FormattedID,TimeEntryItem,TimeEntryValueObject,TimeEntryItemObject,User,UserObject,WorkProduct,Requirement,Parent,PortfolioItem,Task,Artifact,Hierarchy,TypePath,_type,UserObject,UserName,TaskDisplayString,ProjectDisplayString,WorkProductDisplayString,c_SAPNetwork,c_SAPProject,c_SAPSubOperation,c_SAPOperation,Hours,ObjectID,DateVal,c_KMDEmployeeID,Project,c_KMDTimeregistrationIntegration,Owner,EmailAddress,c_DefaultSAPSubOperation,CreationDate" #true

  query.limit = 999999
  query.page_size = 2000
  query.project = nil
  query.query_string = "(((Iteration.StartDate <= #{now}) AND (Iteration.EndDate >= #{now})) AND (Project.c_KMDTimeregistrationIntegration != #{integration}))"
  @rally.find(query)
end

def add_time_entry_to_time_values(task_values,us_values)
  rows = []
  task_values.each do |task|

puts task["WorkProduct"]["FormattedID"]

#puts task["FormattedID"]
#puts task["Name"]
#    work_product_display_string = task["WorkProduct.FormattedID"] + ": " + task["WorkProduct.Name"]


    task_project = task["Project"]

    task_user_object = task["Owner"]

    task_project_owner = task_project["Owner"]

    task_work_product = task["WorkProduct"]["FormattedID"] + ": " + task["WorkProduct"]["Name"]
puts task_work_product

    rows.push({
      "TimeEntryValueObject" => task,
      "UserObject" => task_user_object,
      "TimeEntryProjectOwnerObject" => task_project_owner,
      "TimeEntryProjectObject" => task_project,
      "WorkProductDisplayString" => task_work_product
    })

  end

  us_values.each do |story|

    story_project = story["Project"]

    story_user_object = story["Owner"]

    story_project_owner = story_project["Owner"]

    story_work_product = story["FormattedID"] + ": " + story["Name"]

    rows.push({
      "TimeEntryValueObject" => story,
      "UserObject" => story_user_object,
      "TimeEntryProjectOwnerObject" => story_project_owner,
      "TimeEntryProjectObject" => story_project,
      "WorkProductDisplayString" => story_work_product
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



  # parent.read

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
        'WorkProduct' => row["WorkProductDisplayString"],
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
#  puts output_rows
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
              'text' => 'User',
              'dataIndex' => 'UserName'
          },
          {
              'text' => 'Project',
              'dataIndex' => 'ProjectName'
          },
          {
              'text' => 'Formatted ID',
              'dataIndex' => 'FormattedID'
          },
          {
              'text' => 'Name',
              'dataIndex' => 'Name'
          },
          {
              'text' => 'Work Product',
              'dataIndex' => 'WorkProduct'
          },
          {
              'text' => 'Feature ID',
              'dataIndex' => 'FeatureID'
          },
          {
              'text' => 'Feature Title',
              'dataIndex' => 'FeatureName'
          },
          {
              'text' => 'Epic ID',
              'dataIndex' => 'EpicID'
          },
          {
              'text' => 'Epic Title',
              'dataIndex' => 'EpicName'
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
  if(row['c_SAPSubOperation'] != nil)
    all_sap_keys = row['c_SAPProject'].downcase + row['c_SAPNetwork'].to_s + row['c_SAPOperation'].to_s + row['c_SAPSubOperation'].to_s
    return  @sap_keys_all.include? all_sap_keys
  else
    no_so_sap_keys = row['c_SAPProject'].downcase + row['c_SAPNetwork'].to_s + row['c_SAPOperation'].to_s
    return  @sap_keys_no_so.include? no_so_sap_keys
  end
end

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

  csv = get_split_csv(rows,true)
  #puts csv

  csv.each do |key, array|
    csv_string = CSV.generate do |csv_str|
      array.each do |csv_row|
        csv_str << csv_row
      end
    end
    #puts data

    template_file = File.read(@options.template_file)
    #puts template_file
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


  # @project = []
  # @network = []
  # @operation = []
  # @sub_operation = []
  @sap_keys_all = []
  @sap_keys_no_so = []
  CSV.foreach(file, :col_sep => ";", :return_headers => false, :encoding => 'ISO-8859-1', :quote_char => "\x00") do |row|
    # @project << row[0]
    # @network << row[4]
    # @operation << row[6]
    # @sub_operation << row[8]
    @sap_keys_all << (row[0].nil? ? "" : row[0].downcase) + (row[4].nil? ? "" : row[4]) + (row[6].nil? ? "" : row[6]) + (row[8].nil? ? "" : row[8])
    @sap_keys_no_so << (row[0].nil? ? "" : row[0].downcase) + (row[4].nil? ? "" : row[4]) + (row[6].nil? ? "" : row[6])
  end
# puts @sap_keys_all
# puts @sap_keys_no_so
end

## - start here -
@time_now = Time.new.strftime("%Y_%m_%d_%H_%M_%S")
puts "Start Time: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"
check_usage()
load_keys_from_csv()
puts "Time after parsing CSV file: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"
connect_to_rally()
pi_types = get_pi_types()

puts "Fetching Time Values"
task_values = get_time_values("task")
puts "Time after get_time_values-task: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

us_values = get_time_values("hierarchicalrequirement")

puts "Time after get_time_values-us: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

rows = add_time_entry_to_time_values(task_values,us_values)
puts "Time after add_time_entry_to_time_values: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

rows = add_artifact_to_time_values(rows)
puts "Time after add_artifact_to_time_values: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"


rows = convert_to_output_array(rows,pi_types)
puts "Time after convert_to_output_array: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"

errors_csv(rows)

puts "Done!"
puts "End Time: #{Time.new.strftime("%Y-%m-%d %H:%M:%S")}"