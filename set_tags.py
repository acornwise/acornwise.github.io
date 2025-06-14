import json

# file_name = './extractors/Pattern Recognition.json'
file_name = './questions/Evaluations_ai.json'

with open(file_name) as f:
    data_list = json.load(f)

for it in range(len(data_list)):
    if 'eval_' in data_list[it]['id']:
        data_list[it]['from'] = 'AI'
    else:
        data_list[it]['from'] = 'OUCC'
    
    # data_list[it]['category'] = 'Evaluation'

with open(file_name, 'w') as f:
    json.dump(data_list, f, indent=2)
