#
# usage $0 <auth file>
# ---
require "rally_api"
require "CSV"

def check_usage()
  if ARGV.length == 0 
    puts 
    puts "Usage: ruby export-portfolio-timesheets.rb <authorization_file>"
    puts 
    exit 1
  end
  
  auth_file = ARGV[0]
  
  if !FileTest.exist?(auth_file)
    puts 
    puts "Authorization file #{auth_file} does not exist"
    puts 
    exit 1
  end
  
  require "./#{auth_file}"
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
  query = RallyAPI::RallyQuery.new
  query.type = "TimeEntryValue"
  query.fetch = true
  query.limit = 999999
  query.page_size = 2000
  query.project = nil
  query.query_string = "( Hours > 0 )"
  
  @rally.find(query)
end

def add_time_entry_to_time_values(time_values)
  rows = []
  time_values.each do |time_value|
    time_entry_item = time_value["TimeEntryItem"]
    time_entry_item.read
    rows.push({
      "TimeEntryValueObject" => time_value,
      "TimeEntryItemObject" => time_entry_item
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
  hierarchy = row["Hierarchy"]
  value = nil

  hierarchy.each do |artifact|
    if value.nil? 
      value = artifact[field]
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
    output_rows.push({
      "UserName" => row["UserObject"]["UserName"],
      "TaskDisplayString"  => row["TimeEntryItemObject"]["TaskDisplayString"],
      "ProjectDisplayString"  => row["TimeEntryItemObject"]["ProjectDisplayString"],
      "WorkProductDisplayString" => row["TimeEntryItemObject"]["WorkProductDisplayString"],
      "FeatureID"  => get_type_field_value(row, pi_types[0], "FormattedID"),
      "FeatureName" => get_type_field_value(row, pi_types[0], "Name"),
      'test'  => get_field_value(row, 'FormattedID'),
      'c_SAPNetwork'  => get_field_value(row, 'c_SAPNetwork'),
      'c_SAPOperation'  => get_field_value(row, 'c_SAPOperation'),
      'c_SAPSubOperation'  => get_field_value(row, 'c_SAPSubOperation'),
      'EpicID' => get_type_field_value(row, pi_types[1], "FormattedID"),
      'EpicName' => get_type_field_value(row, pi_types[1], "Name"),
      'Hours' => row["TimeEntryValueObject"]['Hours'],
      'ObjectID' => row["TimeEntryValueObject"]["ObjectID"],
      'Date' => Date.parse(row["TimeEntryValueObject"]['DateVal']).strftime("%Y%m%d"),
      'c_KMDEmployeeID' => row["UserObject"]["c_KMDEmployeeID"],
      'Hierarchy' => row["TimeEntryValueObject"]["Hierarchy"]
    })
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

def get_csv(rows)
  columns = get_columns()
  csv_array = [get_header(columns)]
  rows.each do |row|
    row_csv_array = []
    columns.each do |column|
      field = column['dataIndex']
      row_csv_array.push(escape_text_for_csv(row[field]))
    end
    csv_array.push(row_csv_array)
  end
  
  return csv_array
end

def export_csv(rows)
  csv = get_csv(rows)
  filename = "export.csv"
  
  puts "Writing to #{filename}"  
  CSV.open("#{filename}", "wb") do |csv_file|
    csv.each do |csv_row|
      csv_file << csv_row
    end
  end
end

## - start here -
check_usage()
connect_to_rally()
pi_types = get_pi_types()

puts "Fetching Time Values"
time_values = get_time_values()

rows = add_time_entry_to_time_values(time_values)
rows = add_users_to_time_values(rows)
rows = add_artifact_to_time_values(rows)

rows = convert_to_output_array(rows,pi_types)


# todo export to files
export_csv(rows)

