import os
import json

def generate_challenges_json(source_directory="questions", output_file="challenges.json"):
    """
    Scans a directory for .json files and creates a challenges.json file
    listing their IDs (filenames without extension).

    Args:
        source_directory (str): The directory containing the individual challenge JSON files.
        output_file (str): The name of the JSON file to generate.
    """
    challenge_ids = []
    
    # Ensure the source directory exists
    if not os.path.isdir(source_directory):
        print(f"Error: Source directory '{source_directory}' not found.")
        return

    print(f"Scanning directory: '{os.path.abspath(source_directory)}' for challenge files...")

    for filename in os.listdir(source_directory):
        if filename.endswith(".json"):
            with open(os.path.join(source_directory, filename), 'r') as f:
                data_list = json.load(f)
            
            for data in data_list:
                question_info = {"id": data["id"], "file": f"{source_directory}/{filename}", "from": data["from"]}
                challenge_ids.append(question_info)
                print(f"Found challenge: {question_info['id']} from {question_info['file']}")

    if not challenge_ids:
        print(f"No .json files found in '{source_directory}'. '{output_file}' will be empty or not created.")
    
    # Sort the list of dictionaries by 'id' for consistent output
    challenge_ids.sort(key=lambda item: item['id'])

    try:
        with open(output_file, 'w') as f:
            json.dump(challenge_ids, f, indent=2) # Use indent for readability
        print(f"Successfully generated '{output_file}' with {len(challenge_ids)} challenges.")
    except IOError as e:
        print(f"Error writing to '{output_file}': {e}")

if __name__ == "__main__":
    generate_challenges_json(source_directory="questions", output_file="challenges.json")
