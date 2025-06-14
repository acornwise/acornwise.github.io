import os
import json

base_path = './questions/'
output_path = './questions_by_category/'
category_jsons = dict()

for file_name in os.listdir(base_path):
    if file_name.endswith('.json'):
        with open(os.path.join(base_path, file_name), 'r') as file:
            challenge_data = json.load(file)
            category = challenge_data.get('category', 'General')
            
            if  category not in category_jsons:
                category_jsons[category] = []
            
            category_jsons[category].append(challenge_data)

for category, challenges in category_jsons.items():
    with open(os.path.join(output_path, f'{category}.json'), 'w') as file:
        json.dump(challenges, file)
