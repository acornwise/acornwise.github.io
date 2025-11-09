import os
import json
import random
import string

def generate_short_id(length=5):
    """Generates a random alphanumeric string of a given length."""
    letters_and_digits = string.ascii_letters + string.digits
    return ''.join(random.choice(letters_and_digits) for i in range(length))

def update_question_ids():
    """
    Scans the 'questions' directory, finds all JSON files, and replaces
    the 'id' field of each question with a new, unique short ID.
    """
    questions_dir = 'questions'
    if not os.path.isdir(questions_dir):
        print(f"Error: Directory '{questions_dir}' not found. Make sure this script is in the same folder as the 'questions' directory.")
        return

    print("Starting to update question IDs...")
    
    existing_ids = set()
    files_to_process = [f for f in os.listdir(questions_dir) if f.endswith('.json')]
    
    if not files_to_process:
        print("No JSON files found in the 'questions' directory.")
        return

    # First pass: gather all existing IDs to avoid collisions if script is re-run
    for filename in files_to_process:
        filepath = os.path.join(questions_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for question in data:
                    if 'id' in question:
                        existing_ids.add(question['id'])
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"Warning: Could not read or parse {filename}. Skipping. Error: {e}")

    # Second pass: update IDs
    for filename in files_to_process:
        filepath = os.path.join(questions_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            for question in data:
                new_id = generate_short_id()
                # Ensure the new ID is unique
                while new_id in existing_ids:
                    new_id = generate_short_id()
                
                question['id'] = new_id
                existing_ids.add(new_id)

            # Write the updated data back to the file
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            
            print(f"Successfully updated IDs in {filename}")

        except Exception as e:
            print(f"An error occurred while processing {filename}: {e}")

    print("\nUpdate complete. All question IDs have been shortened.")

if __name__ == '__main__':
    update_question_ids()
