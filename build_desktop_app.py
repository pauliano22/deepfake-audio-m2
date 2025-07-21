# build_desktop_app.py
# Enhanced script to build Lion AI Detection desktop app for distribution

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path

def check_requirements():
    """Check if all required packages are installed"""
    # Map of package names to their import names
    required_packages = {
        'pyaudio': 'pyaudio',
        'numpy': 'numpy', 
        'pillow': 'PIL',  # pillow is imported as PIL
        'pystray': 'pystray',
        'requests': 'requests',
        'plyer': 'plyer'
    }
    
    missing_packages = []
    
    for package_name, import_name in required_packages.items():
        try:
            __import__(import_name)
            print(f"✅ {package_name} found")
        except ImportError:
            missing_packages.append(package_name)
            print(f"❌ {package_name} missing")
    
    if missing_packages:
        print(f"\n⚠️ Missing packages: {', '.join(missing_packages)}")
        print("Install them with: pip install " + " ".join(missing_packages))
        return False
    
    return True

def create_icon_files():
    """Create icon files in different formats for each platform"""
    try:
        from PIL import Image, ImageDraw, ImageFont
        
        # Load the base icon or create one
        if os.path.exists('lion_icon.png'):
            base_icon = Image.open('lion_icon.png')
            print("✅ Using existing lion_icon.png")
        else:
            print("⚠️ lion_icon.png not found, creating default icon...")
            # Create default Lion icon
            base_icon = Image.new('RGB', (256, 256), color='#FFD700')
            draw = ImageDraw.Draw(base_icon)
            
            # Draw a border
            draw.rectangle([0, 0, 255, 255], outline='#FF0000', width=8)
            
            # Try to draw "L" for Lion
            try:
                font = ImageFont.truetype("arial.ttf", 150)
            except:
                font = ImageFont.load_default()
            
            # Draw "L" in center
            bbox = draw.textbbox((0, 0), "L", font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (256 - text_width) // 2
            y = (256 - text_height) // 2
            draw.text((x, y), "L", fill='#000000', font=font)
            
            base_icon.save('lion_icon.png')
        
        # Resize to standard icon sizes
        sizes = [16, 32, 48, 64, 128, 256]
        
        # Create ICO file for Windows
        if platform.system() == 'Windows':
            icon_images = []
            for size in sizes:
                icon_images.append(base_icon.resize((size, size), Image.Resampling.LANCZOS))
            
            icon_images[0].save('lion_icon.ico', format='ICO', sizes=[(s, s) for s in sizes])
            print("✅ Created lion_icon.ico for Windows")
        
        # Create ICNS file for macOS
        elif platform.system() == 'Darwin':
            base_icon.resize((512, 512), Image.Resampling.LANCZOS).save('lion_icon_512.png')
            print("✅ Created lion_icon_512.png for macOS")
        
        return True
        
    except Exception as e:
        print(f"⚠️ Icon creation failed: {e}")
        return False

def get_pyinstaller_command(script_name=None):
    """Get the appropriate PyInstaller command for current platform"""
    
    # Use passed script name or look for it
    if script_name is None:
        script_names = ['deepfake_monitor.py', 'desktop_monitor.py', 'streaming_monitor.py', 'main.py']
        for name in script_names:
            if os.path.exists(name):
                script_name = name
                break
    
    system = platform.system()
    base_command = [
        'pyinstaller',
        '--onefile',
        '--name', 'Lion-AI-Detection',
        '--clean'
    ]
    
    # Add hidden imports for better compatibility
    hidden_imports = [
        'pystray._win32' if system == 'Windows' else 'pystray._xorg',
        'PIL._tkinter_finder',
        'requests.adapters',
        'plyer.platforms.win.notification' if system == 'Windows' else 'plyer.platforms.linux.notification'
    ]
    
    for import_module in hidden_imports:
        base_command.extend(['--hidden-import', import_module])
    
    # Platform-specific settings
    if system == 'Windows':
        base_command.extend([
            '--windowed',  # No console window
            '--icon', 'lion_icon.ico' if os.path.exists('lion_icon.ico') else None
        ])
        
    elif system == 'Darwin':  # macOS
        base_command.extend([
            '--windowed',
            '--icon', 'lion_icon_512.png' if os.path.exists('lion_icon_512.png') else None
        ])
        
    elif system == 'Linux':
        base_command.extend([
            '--icon', 'lion_icon.png' if os.path.exists('lion_icon.png') else None
        ])
    
    # Exclude unnecessary modules to reduce size
    exclude_modules = [
        'matplotlib', 'scipy', 'pandas', 'jupyter', 'IPython'
    ]
    
    for module in exclude_modules:
        base_command.extend(['--exclude-module', module])
    
    # Remove None values
    base_command = [cmd for cmd in base_command if cmd is not None]
    
    # Add the main script
    base_command.append(script_name or 'deepfake_monitor.py')
    
    return base_command

def build_application():
    """Build the application for current platform"""
    
    print(f"🚀 Building Lion AI Detection for {platform.system()}...")
    
    # Check if main script exists
    script_names = ['deepfake_monitor.py', 'desktop_monitor.py', 'streaming_monitor.py', 'main.py']
    main_script = None
    
    for script_name in script_names:
        if os.path.exists(script_name):
            main_script = script_name
            print(f"📝 Found main script: {script_name}")
            break
    
    if not main_script:
        print(f"❌ Main script not found! Looking for: {', '.join(script_names)}")
        print("💡 Make sure your Python file is in the current directory")
        return False
    
    # Create icon files
    print("🎨 Creating icon files...")
    create_icon_files()
    
    # Get build command
    command = get_pyinstaller_command(main_script)
    
    # Try different PyInstaller execution methods
    success = False
    
    # Method 1: Try as Python module
    if command[0] == 'pyinstaller':
        module_command = [sys.executable, '-m'] + command
        print(f"🔨 Trying module method: {' '.join(module_command[:8])}...")
        
        try:
            result = subprocess.run(module_command, check=True, capture_output=True, text=True)
            success = True
            print("✅ Build completed successfully! (module method)")
        except subprocess.CalledProcessError as e:
            print(f"⚠️ Module method failed: {e.returncode}")
            print("🔄 Trying direct command...")
    
    # Method 2: Try direct pyinstaller command
    if not success:
        print(f"🔨 Trying direct method: {' '.join(command[:8])}...")
        
        try:
            result = subprocess.run(command, check=True, capture_output=True, text=True)
            success = True
            print("✅ Build completed successfully! (direct method)")
        except subprocess.CalledProcessError as e:
            print(f"❌ Direct method also failed: {e.returncode}")
            if e.stderr:
                print(f"Error output: {e.stderr}")
            if e.stdout:
                print(f"Standard output: {e.stdout}")
            return False
    
    if success:
        # Show output location
        system = platform.system()
        if system == 'Windows':
            executable_path = 'dist/Lion-AI-Detection.exe'
        elif system == 'Darwin':
            executable_path = 'dist/Lion-AI-Detection.app'
        else:
            executable_path = 'dist/Lion-AI-Detection'
        
        if os.path.exists(executable_path):
            print(f"📦 Executable created: {executable_path}")
            print(f"📏 File size: {os.path.getsize(executable_path) / (1024*1024):.1f} MB")
        
        return True
        
    else:
        return False

def create_distribution_package():
    """Create a distribution package with instructions"""
    
    system = platform.system()
    
    # Create distribution folder
    dist_folder = Path('distribution')
    dist_folder.mkdir(exist_ok=True)
    
    # Copy executable
    if system == 'Windows':
        exe_name = 'Lion-AI-Detection.exe'
        if os.path.exists(f'dist/{exe_name}'):
            shutil.copy(f'dist/{exe_name}', dist_folder / exe_name)
    elif system == 'Darwin':
        app_name = 'Lion-AI-Detection.app'
        if os.path.exists(f'dist/{app_name}'):
            shutil.copytree(f'dist/{app_name}', dist_folder / app_name, dirs_exist_ok=True)
    else:  # Linux
        exe_name = 'Lion-AI-Detection'
        if os.path.exists(f'dist/{exe_name}'):
            shutil.copy(f'dist/{exe_name}', dist_folder / exe_name)
            os.chmod(dist_folder / exe_name, 0o755)
    
    # Create README with enhanced instructions
    readme_content = f"""# Lion AI Detection - Desktop Monitor v1.0

## What It Does:
🛡️ Real-time AI voice detection to protect against deepfake audio
🚨 Instant alerts when AI-generated voices are detected
🎯 Monitors system audio automatically
🔒 Privacy-focused - no data stored locally

## Installation Instructions ({system}):
"""
    
    if system == 'Windows':
        readme_content += """
1. Download Lion-AI-Detection.exe
2. Run the executable (Windows Defender may show warning - this is normal)
3. If security warning appears: Click "More info" → "Run anyway"
4. Look for lion icon in system tray (bottom-right corner)
5. Right-click the tray icon and select "Start Real-Time Monitoring"

### For System Audio Monitoring:
1. Right-click speaker icon in system tray
2. Select "Open Sound settings"
3. Scroll down and click "Sound Control Panel"
4. Go to "Recording" tab
5. Right-click empty space → "Show Disabled Devices"
6. Find "Stereo Mix" → Right-click → "Enable"
7. Set as default recording device

### System Requirements:
- Windows 10 or later (64-bit)
- Minimum 4GB RAM
- Internet connection for AI analysis
"""
    elif system == 'Darwin':
        readme_content += """
1. Download Lion-AI-Detection.app
2. Move to Applications folder
3. First launch: Right-click → "Open" (bypass Gatekeeper)
4. Grant microphone permissions when prompted
5. Look for lion icon in menu bar
6. Right-click menu bar icon and select "Start Real-Time Monitoring"

### System Requirements:
- macOS 10.14 (Mojave) or later
- Intel or Apple Silicon Mac
- Microphone access permissions
- Internet connection for AI analysis
"""
    else:  # Linux
        readme_content += """
1. Download Lion-AI-Detection
2. Open terminal in download folder
3. Make executable: chmod +x Lion-AI-Detection
4. Run: ./Lion-AI-Detection
5. Look for lion icon in system tray
6. Right-click tray icon and select "Start Real-Time Monitoring"

### System Requirements:
- Modern Linux distribution (Ubuntu 18.04+, etc.)
- GNOME, KDE, or compatible desktop environment
- Audio input device configured
- Internet connection for AI analysis
"""
    
    readme_content += """
## How to Use:
1. Start the application
2. Right-click the tray/menu bar icon
3. Select "Start Real-Time Monitoring"
4. The app will monitor audio in real-time
5. You'll get instant alerts if deepfake audio is detected

## Alert Types:
- 🔊 Sound alerts (beep sequences)
- 💬 Popup notifications
- 📱 System tray notifications
- 📝 Detection logging

## Privacy & Security:
✅ No personal data collected
✅ Audio processed via secure Hugging Face API
✅ No permanent storage of audio files
✅ All processing happens in real-time

## Troubleshooting:
- If no alerts: Check microphone permissions
- System audio issues: Enable "Stereo Mix" (Windows)
- Performance issues: Close unnecessary apps
- False positives: Adjust sensitivity in settings

## Support:
🌐 Website: https://lion-project.vercel.app/
📧 Issues: Report on GitHub or website
💡 Tips: Check the log files for detection history

## Version: 1.0
Built with PyInstaller for maximum compatibility
"""
    
    # Write README
    with open(dist_folder / 'README.txt', 'w', encoding='utf-8') as f:
        f.write(readme_content)
    
    print(f"📁 Distribution package created in: {dist_folder}")
    print("📋 Files included:")
    for file in dist_folder.rglob('*'):
        if file.is_file():
            print(f"  - {file.name} ({file.stat().st_size / (1024*1024):.1f} MB)")

def main():
    """Main build process"""
    print("🦁 Lion AI Detection - Enhanced Build Script")
    print(f"🖥️ Platform: {platform.system()}")
    print(f"🐍 Python: {sys.version}")
    print("="*50)
    
    # Check requirements first
    print("🔍 Checking requirements...")
    if not check_requirements():
        print("\n❌ Please install missing packages before building")
        return
    
    # Check PyInstaller installation - try multiple methods
    pyinstaller_working = False
    
    # Method 1: Try as module
    try:
        result = subprocess.run([sys.executable, '-m', 'pyinstaller', '--version'], 
                              check=True, capture_output=True, text=True)
        print(f"✅ PyInstaller found (module): {result.stdout.strip()}")
        pyinstaller_working = True
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Method 2: Try direct command
        try:
            result = subprocess.run(['pyinstaller', '--version'], 
                                  check=True, capture_output=True, text=True)
            print(f"✅ PyInstaller found (direct): {result.stdout.strip()}")
            pyinstaller_working = True
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("❌ PyInstaller not found. Installing...")
            try:
                subprocess.run([sys.executable, '-m', 'pip', 'install', '--user', 'pyinstaller'], check=True)
                print("✅ PyInstaller installed successfully!")
                
                # Try again after installation
                try:
                    subprocess.run([sys.executable, '-m', 'pyinstaller', '--version'], 
                                  check=True, capture_output=True, text=True)
                    pyinstaller_working = True
                except:
                    try:
                        subprocess.run(['pyinstaller', '--version'], 
                                      check=True, capture_output=True, text=True)
                        pyinstaller_working = True
                    except:
                        print("❌ PyInstaller installation verification failed")
                        print("💡 Try: pip install --user pyinstaller")
                        print("💡 Or add Python Scripts to PATH")
                        return
                        
            except subprocess.CalledProcessError as e:
                print(f"❌ Failed to install PyInstaller: {e}")
                return
    
    if not pyinstaller_working:
        print("❌ PyInstaller is not working properly")
        return
    
    print("\n🔨 Starting build process...")
    
    # Build application
    if build_application():
        create_distribution_package()
        print("\n🎉 Build process completed successfully!")
        print(f"📦 Ready for distribution on {platform.system()}")
        
        # Show next steps
        print("\n📋 Next Steps:")
        print("1. Test the executable on a clean system")
        print("2. Upload to your website for download") 
        print("3. Consider code signing for enhanced security")
        print("4. Create installation instructions for users")
        
    else:
        print("\n❌ Build process failed!")
        print("💡 Check the error messages above and try again")

if __name__ == "__main__":
    main()